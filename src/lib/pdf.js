import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Walk a page's operator list to find where images are painted, tracking the
// transform matrix. Images draw in a unit square, so the current matrix maps
// it to the page; we then map to displayed pixels via the viewport transform.
async function detectImages(page, viewport) {
  const { OPS, Util } = pdfjsLib
  const imageOps = new Set([
    OPS.paintImageXObject,
    OPS.paintJpegXObject,
    OPS.paintImageMaskXObject,
    OPS.paintInlineImage,
  ])
  const opList = await page.getOperatorList()
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack = []
  const seen = new Set()
  const regions = []

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0]
    else if (fn === OPS.transform) ctm = Util.transform(ctm, opList.argsArray[i])
    else if (imageOps.has(fn)) {
      const m = Util.transform(viewport.transform, ctm)
      const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => [
        m[0] * x + m[2] * y + m[4],
        m[1] * x + m[3] * y + m[5],
      ])
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const width = Math.max(...xs) - x
      const height = Math.max(...ys) - y
      if (width < 12 || height < 12) continue // skip icons / noise
      const key = `${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`
      if (seen.has(key)) continue
      seen.add(key)
      regions.push({ x, y, width, height })
    }
  }
  return regions
}

// Estimate a text run's ink colour by sampling the rendered raster inside its
// box. PDF.js text content carries no colour, so without this every edited run
// would revert to black — losing blue links, coloured headings, etc. We take
// the darkest ~25% of opaque pixels (the glyph strokes, ignoring the light
// background and anti-aliased edges) and average them. Returns a #rrggbb string,
// or null when the box holds no real ink (so the caller keeps its default).
function sampleInkColor(data, canvasW, canvasH, box) {
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(canvasW, Math.ceil(box.x + box.width))
  const y1 = Math.min(canvasH, Math.ceil(box.y + box.height))
  if (x1 <= x0 || y1 <= y0) return null

  const px = [] // { lum, r, g, b }
  for (let y = y0; y < y1; y++) {
    let o = (y * canvasW + x0) * 4
    for (let x = x0; x < x1; x++, o += 4) {
      const a = data[o + 3]
      if (a < 32) continue
      const r = data[o]
      const g = data[o + 1]
      const b = data[o + 2]
      px.push({ lum: 0.299 * r + 0.587 * g + 0.114 * b, r, g, b })
    }
  }
  if (px.length < 4) return null

  px.sort((a, b) => a.lum - b.lum)
  const take = Math.max(3, Math.round(px.length * 0.25))
  let r = 0, g = 0, b = 0, lum = 0
  for (let i = 0; i < take; i++) {
    r += px[i].r; g += px[i].g; b += px[i].b; lum += px[i].lum
  }
  if (lum / take > 210) return null // no real ink — box is essentially blank
  const hex = (n) => Math.round(n / take).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

// Classify a font's family / style from its PostScript or family name.
function classifyFamily(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('courier') || n.includes('mono') || n.includes('consol') || n.includes('menlo'))
    return 'mono'
  if (
    n.includes('times') ||
    n.includes('georgia') ||
    n.includes('garamond') ||
    n.includes('minion') ||
    n.includes('roman') ||
    n.includes('cambria') ||
    n.includes('palatino') ||
    n.includes('book antiqua') ||
    (n.includes('serif') && !n.includes('sans'))
  )
    return 'serif'
  return 'sans'
}
function classifyStyle(name) {
  const n = (name || '').toLowerCase()
  return {
    bold: /bold|black|heavy|semibold/.test(n),
    italic: /italic|oblique/.test(n),
  }
}

// Turn a PDF font name (e.g. "ABCDEF+TimesNewRomanPSMT-Bold") into a CSS family
// the browser can actually render, so standard fonts match on screen.
const KNOWN_FONTS = {
  arial: 'Arial',
  helvetica: 'Helvetica',
  helveticaneue: '"Helvetica Neue"',
  times: '"Times New Roman"',
  timesnewroman: '"Times New Roman"',
  georgia: 'Georgia',
  verdana: 'Verdana',
  courier: '"Courier New"',
  couriernew: '"Courier New"',
  calibri: 'Calibri',
  cambria: 'Cambria',
  tahoma: 'Tahoma',
  garamond: 'Garamond',
  palatino: 'Palatino',
  segoeui: '"Segoe UI"',
}
function cssNameFromFont(raw) {
  const base = (raw || '')
    .replace(/^[A-Z]{6}\+/, '') // strip subset prefix
    .replace(/[-_,].*$/, '') // strip style suffix (e.g. -Bold)
    .replace(/(MT|PSMT|PS)$/, '')
    .trim()
  if (!base) return ''
  const key = base.toLowerCase().replace(/\s+/g, '')
  return KNOWN_FONTS[key] || `"${base}"`
}

// True redaction: re-render the given pages to high-res rasters with the
// redaction rectangles painted solid black, so the underlying text/images are
// physically gone from the output (not merely covered). Returns
// Map<pageIndex, { dataUrl }>. `rectsByPage` rectangles are in display pixels
// (the editor's coordinate space); `infoByIndex` gives each page's display
// width so we can scale them onto the high-res canvas.
// `specByPage` maps pageIndex -> { rects, rotation }. Each listed page is
// re-rendered at high res in its current rotation with the redaction rectangles
// blacked out, then returned as a PNG to embed in place of the original page.
export async function flattenRedactedPages(arrayBuffer, specByPage, infoByIndex, dpi = 200) {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
  const out = new Map()
  try {
    for (const [pageIndex, spec] of specByPage) {
      const rects = spec.rects || []
      const rotation = spec.rotation || 0
      const page = await doc.getPage(pageIndex + 1)
      const scale = dpi / 72 // points -> pixels at the chosen DPI
      const viewport = page.getViewport({ scale, rotation })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise

      // editor rects are in display px; map them onto this high-res canvas
      const info = infoByIndex.get(pageIndex)
      const ratio = info ? canvas.width / info.width : 1
      ctx.fillStyle = '#000000'
      for (const r of rects) {
        ctx.fillRect(
          Math.floor(r.x * ratio),
          Math.floor(r.y * ratio),
          Math.ceil(r.w * ratio),
          Math.ceil(r.h * ratio),
        )
      }
      out.set(pageIndex, { dataUrl: canvas.toDataURL('image/png') })
    }
  } finally {
    doc.destroy?.()
  }
  return out
}

// Build the display + edit record for one page at the given rotation
// (0/90/180/270, clockwise). `fonts` is mutated with any embedded font programs
// found, so edits can reuse the exact typeface. Returns everything except the
// page index, which the caller assigns.
async function buildPageRecord(page, targetWidth, rotation, fonts) {
  // With a rotation the viewport's width/height swap for 90/270, so the page
  // stays `targetWidth` wide on screen in its rotated orientation.
  const base = page.getViewport({ scale: 1, rotation })
  const scale = targetWidth / base.width
  const viewport = page.getViewport({ scale, rotation })

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise

  // Pull out every text run with its on-screen box, so the user can click
  // existing PDF text and edit it in place (white-out + editable overlay).
  const textContent = await page.getTextContent()

  // Resolve each font's real name (PostScript name) from commonObjs — populated
  // after render — and cache the family/style classification per font id.
  const fontInfoCache = {}
  const getFontInfo = (fontName) => {
    if (fontName in fontInfoCache) return fontInfoCache[fontName]
    let name = ''
    let fontRef = null
    try {
      const f = page.commonObjs.has(fontName) ? page.commonObjs.get(fontName) : null
      if (f) {
        name = f.name || f.fallbackName || ''
        // capture the actual embedded font program so edits can reuse it
        if (f.data && f.data.length && f.loadedName) {
          fontRef = f.loadedName
          if (!fonts[fontRef]) fonts[fontRef] = { data: f.data, mimetype: f.mimetype || 'font/opentype' }
        }
      }
    } catch {}
    if (!name) name = textContent.styles?.[fontName]?.fontFamily || ''
    const info = {
      fontCategory: classifyFamily(name),
      ...classifyStyle(name),
      fontRef,
      fontName: cssNameFromFont(name),
    }
    fontInfoCache[fontName] = info
    return info
  }

  // One read of the rendered page so we can sample each run's ink colour
  // without a getImageData call per run.
  const pageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data

  const textItems = []
  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
    const fontSize = Math.hypot(tx[2], tx[3])
    const info = getFontInfo(item.fontName)
    const x = tx[4]
    const y = tx[5] - fontSize
    const width = item.width * scale

    textItems.push({
      str: item.str,
      x, // displayed px, left
      y, // displayed px, top (tx[5] is the baseline)
      width,
      height: fontSize,
      fontSize,
      fontCategory: info.fontCategory,
      fontBold: info.bold,
      fontItalic: info.italic,
      fontRef: info.fontRef,
      fontName: info.fontName,
      color: sampleInkColor(pageData, canvas.width, canvas.height, { x, y, width, height: fontSize }),
    })
  }

  let imageRegions = []
  try {
    imageRegions = await detectImages(page, viewport)
    // Drop near-full-page images (e.g. a scanned page is one giant image):
    // it isn't a meaningful "remove/replace this picture" target and would
    // tint the whole page on hover. It stays as the locked background.
    imageRegions = imageRegions.filter(
      (r) => !(r.width >= viewport.width * 0.92 && r.height >= viewport.height * 0.92),
    )
  } catch (e) {
    console.error('image detection failed', e)
  }

  // Interactive AcroForm fields (text inputs + checkboxes), so a fillable PDF
  // can be filled in place. Field rects are mapped to display px via the same
  // viewport transform as text, so they line up with the rendered widgets.
  const formFields = []
  try {
    for (const a of await page.getAnnotations()) {
      if (a.subtype !== 'Widget' || !a.fieldName || a.readOnly) continue
      const [x1, y1] = pdfjsLib.Util.applyTransform([a.rect[0], a.rect[1]], viewport.transform)
      const [x2, y2] = pdfjsLib.Util.applyTransform([a.rect[2], a.rect[3]], viewport.transform)
      const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
      if (a.fieldType === 'Tx') {
        formFields.push({ name: a.fieldName, type: 'text', ...box, value: a.fieldValue || '', multiline: !!a.multiLine })
      } else if (a.fieldType === 'Btn' && a.checkBox) {
        formFields.push({ name: a.fieldName, type: 'checkbox', ...box, checked: !!a.fieldValue && a.fieldValue !== 'Off' })
      } else if (a.fieldType === 'Btn' && a.radioButton) {
        // One widget per radio option; they share a fieldName (the group).
        const on = String(a.buttonValue ?? a.exportValue ?? '')
        formFields.push({ name: a.fieldName, type: 'radio', ...box, value: on, checked: a.fieldValue != null && String(a.fieldValue) === on })
      } else if (a.fieldType === 'Ch') {
        const options = (a.options || []).map((o) => ({ display: o.displayValue ?? o.exportValue, value: o.exportValue ?? o.displayValue }))
        const v = Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue
        formFields.push({ name: a.fieldName, type: 'select', ...box, value: v || '', options })
      }
    }
  } catch (e) {
    console.error('form field read failed', e)
  }

  return {
    scale, // displayed px per PDF point
    width: canvas.width, // displayed px
    height: canvas.height,
    pdfWidth: base.width, // points (rotated dims for 90/270)
    pdfHeight: base.height,
    rotation,
    dataUrl: canvas.toDataURL('image/png'),
    textItems,
    imageRegions,
    formFields,
  }
}

// Render every page of a PDF to a raster image we can show as a locked background.
// We keep both the displayed pixel size (scaled) and the native PDF size (points)
// so we can map editor coordinates back to PDF coordinates on export.
export async function renderPdf(arrayBuffer, targetWidth = 820) {
  // pdf.js detaches the buffer it receives — hand it a copy so the caller keeps theirs.
  const doc = await pdfjsLib.getDocument({
    data: arrayBuffer.slice(0),
    fontExtraProperties: true, // keep embedded font bytes so we can reuse them
  }).promise
  const pages = []
  const fonts = {} // loadedName -> { data, mimetype } of embedded fonts (for exact reuse)

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const record = await buildPageRecord(page, targetWidth, 0, fonts)
    pages.push({ pageIndex: i - 1, ...record })
  }

  return { pages, fonts }
}

// Re-render one page at a new rotation (for the Pages panel's rotate control).
// Returns { record, fonts } — the page record (sans index) and any embedded
// fonts found, to merge into the app's font set.
export async function renderSinglePage(arrayBuffer, pageIndex, rotation, targetWidth = 820) {
  const doc = await pdfjsLib.getDocument({
    data: arrayBuffer.slice(0),
    fontExtraProperties: true,
  }).promise
  const fonts = {}
  try {
    const page = await doc.getPage(pageIndex + 1)
    const norm = ((rotation % 360) + 360) % 360
    const record = await buildPageRecord(page, targetWidth, norm, fonts)
    return { record, fonts }
  } finally {
    doc.destroy?.()
  }
}
