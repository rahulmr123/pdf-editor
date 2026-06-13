import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { getDocFontBytes } from './docfonts.js'

function hexToRgb(hex) {
  const m = hex.replace('#', '')
  const n = parseInt(m.length === 3 ? m.replace(/(.)/g, '$1$1') : m, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Flatten the editor's overlay objects onto the ORIGINAL PDF, so the source
// stays pixel-perfect and our edits are stamped on top.
//
// `pageOrder` is the displayed sequence of original page indices (after the
// user reorders / deletes pages). When given, the output is rebuilt in that
// order with deleted pages dropped; objects on dropped pages are skipped.
export async function exportPdf(originalArrayBuffer, pages, objects, fonts = {}, pageOrder = null) {
  const src = await PDFDocument.load(originalArrayBuffer.slice(0))
  const order = pageOrder && pageOrder.length ? pageOrder : pages.map((p) => p.pageIndex)

  // Build a fresh document containing only the kept pages, in the chosen order.
  // Blank pages (inserted in the editor) have no source page, so we create them
  // fresh at their stored size; the rest are copied from the original.
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const sizeByIndex = new Map(pages.map((p) => [p.pageIndex, p]))
  const isBlank = (i) => !!sizeByIndex.get(i)?.blank
  const realIndices = order.filter((i) => !isBlank(i))
  const copied = await pdfDoc.copyPages(src, realIndices)
  const copiedByIndex = new Map(realIndices.map((i, k) => [i, copied[k]]))
  for (const i of order) {
    if (isBlank(i)) {
      const info = sizeByIndex.get(i)
      pdfDoc.addPage([info.pdfWidth, info.pdfHeight])
    } else {
      pdfDoc.addPage(copiedByIndex.get(i))
    }
  }

  // Map a source page index -> its position in the rebuilt document.
  const posOf = new Map(order.map((srcIndex, pos) => [srcIndex, pos]))
  const infoById = new Map(pages.map((p) => [p.pageIndex, p]))

  // Reuse the PDF's own embedded fonts when we have them (exact match).
  const customCache = {}
  const customFont = async (ref) => {
    if (!ref || !fonts[ref]) return null
    if (ref in customCache) return customCache[ref]
    try {
      customCache[ref] = await pdfDoc.embedFont(fonts[ref].data, { subset: false })
    } catch {
      customCache[ref] = null
    }
    return customCache[ref]
  }

  // bundled document fonts (the "Document font" feature)
  const docCache = {}
  const docFont = async (key, bold) => {
    const ck = `${key}:${bold ? 1 : 0}`
    if (ck in docCache) return docCache[ck]
    try {
      const bytes = await getDocFontBytes(key, bold)
      docCache[ck] = bytes ? await pdfDoc.embedFont(bytes, { subset: true }) : null
    } catch {
      docCache[ck] = null
    }
    return docCache[ck]
  }

  // Match the original font family: serif -> Times, mono -> Courier, else Helvetica.
  const F = StandardFonts
  const families = {
    sans: { normal: F.Helvetica, bold: F.HelveticaBold, italic: F.HelveticaOblique, bolditalic: F.HelveticaBoldOblique },
    serif: { normal: F.TimesRoman, bold: F.TimesRomanBold, italic: F.TimesRomanItalic, bolditalic: F.TimesRomanBoldItalic },
    mono: { normal: F.Courier, bold: F.CourierBold, italic: F.CourierOblique, bolditalic: F.CourierBoldOblique },
  }
  const embedded = {}
  for (const family of Object.values(families)) {
    for (const std of Object.values(family)) {
      if (!embedded[std]) embedded[std] = await pdfDoc.embedFont(std)
    }
  }
  const fontFor = (o) => {
    const fam = families[o.font] || families.sans
    const variant = o.bold && o.italic ? 'bolditalic' : o.bold ? 'bold' : o.italic ? 'italic' : 'normal'
    return embedded[fam[variant]]
  }
  const docPages = pdfDoc.getPages()

  // Whiteouts first, so text drawn afterwards sits on top of the cover.
  const ordered = [...objects].sort((a, b) => (a.type === 'whiteout' ? -1 : 1))

  for (const obj of ordered) {
    const info = infoById.get(obj.pageIndex)
    const pos = posOf.get(obj.pageIndex)
    const page = pos == null ? null : docPages[pos]
    if (!info || !page) continue // page was deleted, or unknown

    const { height: pdfPageHeight } = page.getSize()
    const scale = info.scale

    if (obj.type === 'whiteout') {
      const [wr, wg, wb] = hexToRgb(obj.color || '#ffffff')
      const w = obj.w / scale
      const h = obj.h / scale
      page.drawRectangle({
        x: obj.x / scale,
        y: pdfPageHeight - obj.y / scale - h,
        width: w,
        height: h,
        color: rgb(wr / 255, wg / 255, wb / 255),
      })
      continue
    }

    if (obj.type === 'highlight') {
      const [hr, hg, hb] = hexToRgb(obj.color)
      const w = obj.w / scale
      const h = obj.h / scale
      page.drawRectangle({
        x: obj.x / scale,
        y: pdfPageHeight - obj.y / scale - h,
        width: w,
        height: h,
        color: rgb(hr / 255, hg / 255, hb / 255),
        opacity: obj.opacity ?? 0.4,
      })
      continue
    }

    if (obj.type === 'image') {
      try {
        const img = obj.src.startsWith('data:image/png')
          ? await pdfDoc.embedPng(obj.src)
          : await pdfDoc.embedJpg(obj.src)
        const w = obj.w / scale
        const h = obj.h / scale
        page.drawImage(img, {
          x: obj.x / scale,
          y: pdfPageHeight - obj.y / scale - h,
          width: w,
          height: h,
        })
      } catch (e) {
        console.error('Could not embed image', e)
      }
      continue
    }

    if (obj.type !== 'text' || !obj.text.trim()) continue

    // editor coords are screen px from the page's top-left.
    // PDF coords are points from the bottom-left, baseline-anchored.
    const size = obj.fontSize / scale
    const x = obj.x / scale
    const lineHeight = size * 1.2
    const [r, g, b] = hexToRgb(obj.color)
    const stdFont = fontFor(obj)
    const font =
      (obj.docFontKey && (await docFont(obj.docFontKey, obj.bold))) ||
      (await customFont(obj.fontRef)) ||
      stdFont
    const lines = obj.text.split('\n')

    const widthOf = (f, line) => {
      try {
        return f.widthOfTextAtSize(line, size)
      } catch {
        return 0
      }
    }

    // background fill behind the text (matches the on-screen padding)
    if (obj.bgColor && obj.bgColor !== 'none') {
      const padX = 3 / scale
      const padY = 2 / scale
      const maxW = Math.max(...lines.map((l) => widthOf(font, l) || widthOf(stdFont, l)))
      const blockH = lines.length * lineHeight
      const [fr, fg, fb] = hexToRgb(obj.bgColor)
      page.drawRectangle({
        x: x - padX,
        y: pdfPageHeight - obj.y / scale - blockH - padY,
        width: maxW + 2 * padX,
        height: blockH + 2 * padY,
        color: rgb(fr / 255, fg / 255, fb / 255),
      })
    }

    lines.forEach((line, i) => {
      const topY = obj.y / scale + i * lineHeight
      const baselineY = pdfPageHeight - topY - size
      const color = rgb(r / 255, g / 255, b / 255)
      // prefer the embedded font; fall back to a standard one if a glyph is missing
      try {
        page.drawText(line, { x, y: baselineY, size, font, color })
      } catch {
        page.drawText(line, { x, y: baselineY, size, font: stdFont, color })
      }
    })
  }

  return pdfDoc.save()
}
