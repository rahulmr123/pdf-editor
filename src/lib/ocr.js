import { createWorker } from 'tesseract.js'

// Client-side OCR for scanned (image-only) PDFs. We run Tesseract on each
// page's rendered raster and turn the recognised words into the SAME
// textItems shape that PDF.js produces — so click-to-edit, select-area,
// document-font and export all work on scanned pages with no extra plumbing.
//
// Everything runs in the browser (Tesseract is wasm); the user's file never
// leaves the machine. Only the public language model is fetched.

const MIN_CONFIDENCE = 35 // drop very-low-confidence noise words

// Word bbox is in the page-raster's pixel space, which is exactly the space
// our textItems use (displayed px from the top-left), so coords map directly.
function wordsToTextItems(data) {
  const items = []
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const w of line.words || []) {
          const str = (w.text || '').trim()
          if (!str || w.confidence < MIN_CONFIDENCE) continue
          const { x0, y0, x1, y1 } = w.bbox
          const height = y1 - y0
          if (height <= 0 || x1 - x0 <= 0) continue
          items.push({
            str,
            x: x0,
            y: y0,
            width: x1 - x0,
            height,
            fontSize: height,
            fontCategory: 'sans',
            fontBold: false,
            fontItalic: false,
            fontRef: null,
            fontName: '',
            ocr: true,
          })
        }
      }
    }
  }
  return items
}

// OCR the given pages (each needs a `dataUrl` and `pageIndex`). Reports
// progress via onProgress({ page, total, ratio }). Returns
// [{ pageIndex, textItems }].
export async function ocrPages(pages, onProgress) {
  const state = { page: 0 }
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress?.({ page: state.page, total: pages.length, ratio: m.progress })
      }
    },
  })
  try {
    const results = []
    for (let i = 0; i < pages.length; i++) {
      state.page = i
      onProgress?.({ page: i, total: pages.length, ratio: 0 })
      const { data } = await worker.recognize(pages[i].dataUrl, {}, { blocks: true })
      results.push({ pageIndex: pages[i].pageIndex, textItems: wordsToTextItems(data) })
    }
    return results
  } finally {
    await worker.terminate()
  }
}
