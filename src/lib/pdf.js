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

    pages.push({
      pageIndex: i - 1,
      scale, // displayed px per PDF point
      width: canvas.width, // displayed px
      height: canvas.height,
      pdfWidth: base.width, // points
      pdfHeight: base.height,
      dataUrl: canvas.toDataURL('image/png'),
    })
  }

  return pages
}
