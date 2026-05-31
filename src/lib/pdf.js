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
    const base = page.getViewport({ scale: 1 })
    const scale = targetWidth / base.width
    const viewport = page.getViewport({ scale })

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

    const textItems = []
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const fontSize = Math.hypot(tx[2], tx[3])
      const info = getFontInfo(item.fontName)

      textItems.push({
        str: item.str,
        x: tx[4], // displayed px, left
        y: tx[5] - fontSize, // displayed px, top (tx[5] is the baseline)
        width: item.width * scale,
        height: fontSize,
        fontSize,
        fontCategory: info.fontCategory,
        fontBold: info.bold,
        fontItalic: info.italic,
        fontRef: info.fontRef,
        fontName: info.fontName,
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

    pages.push({
      pageIndex: i - 1,
      scale, // displayed px per PDF point
      width: canvas.width, // displayed px
      height: canvas.height,
      pdfWidth: base.width, // points
      pdfHeight: base.height,
      dataUrl: canvas.toDataURL('image/png'),
      textItems,
      imageRegions,
    })
  }

  return { pages, fonts }
}
