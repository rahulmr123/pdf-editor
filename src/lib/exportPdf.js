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
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const docPages = pdfDoc.getPages()

  for (const obj of objects) {
    if (obj.type !== 'text' || !obj.text.trim()) continue

    const info = pages[obj.pageIndex]
    const page = docPages[obj.pageIndex]
    if (!info || !page) continue

    const { height: pdfPageHeight } = page.getSize()
    const scale = info.scale

    // editor coords are screen px from the page's top-left.
    // PDF coords are points from the bottom-left, baseline-anchored.
    const size = obj.fontSize / scale
    const x = obj.x / scale
    const lineHeight = size * 1.2
    const [r, g, b] = hexToRgb(obj.color)

    obj.text.split('\n').forEach((line, i) => {
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
