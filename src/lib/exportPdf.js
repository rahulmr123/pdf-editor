import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

function hexToRgb(hex) {
  const m = hex.replace('#', '')
  const n = parseInt(m.length === 3 ? m.replace(/(.)/g, '$1$1') : m, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Flatten the editor's overlay objects onto the ORIGINAL PDF, so the source
// stays pixel-perfect and our edits are stamped on top.
export async function exportPdf(originalArrayBuffer, pages, objects) {
  const pdfDoc = await PDFDocument.load(originalArrayBuffer.slice(0))

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
    const info = pages[obj.pageIndex]
    const page = docPages[obj.pageIndex]
    if (!info || !page) continue

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
    const font = fontFor(obj)
    const lines = obj.text.split('\n')

    // background fill behind the text (matches the on-screen padding)
    if (obj.bgColor && obj.bgColor !== 'none') {
      const padX = 3 / scale
      const padY = 2 / scale
      const maxW = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size)))
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
      page.drawText(line, {
        x,
        y: baselineY,
        size,
        font,
        color: rgb(r / 255, g / 255, b / 255),
      })
    })
  }

  return pdfDoc.save()
}
