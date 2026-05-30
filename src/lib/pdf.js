import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Render every page of a PDF to a raster image we can show as a locked background.
// We keep both the displayed pixel size (scaled) and the native PDF size (points)
// so we can map editor coordinates back to PDF coordinates on export.
export async function renderPdf(arrayBuffer, targetWidth = 820) {
  // pdf.js detaches the buffer it receives — hand it a copy so the caller keeps theirs.
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
  const pages = []

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
    const textItems = []
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const fontSize = Math.hypot(tx[2], tx[3])
      textItems.push({
        str: item.str,
        x: tx[4], // displayed px, left
        y: tx[5] - fontSize, // displayed px, top (tx[5] is the baseline)
        width: item.width * scale,
        height: fontSize,
        fontSize,
      })
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
    })
  }

  return pages
}
