# PDF Editor — prototype

A 100% client-side PDF editor. Upload a PDF, drop and drag text on top of it, and
export a new PDF — your file never leaves the browser.

This is the core proof-of-concept loop for a Canva-style PDF editing product:

- **Upload** → each page is rendered to a locked background image (PDF.js)
- **Edit** → add / drag / resize / recolor text objects on an overlay layer
- **Export** → overlay objects are flattened onto the *original* PDF (pdf-lib),
  so the source stays pixel-perfect and edits are stamped on top

## Why this architecture

A PDF is print instructions, not an editable document. Converting it to an
editable file and back is lossy. Instead we keep the original PDF as a locked
background and treat each page as a canvas you drop objects onto — then bake
those objects back into the original on export.

## Stack

- [Vite](https://vitejs.dev/) + React
- [PDF.js](https://mozilla.github.io/pdf.js/) — render pages
- [pdf-lib](https://pdf-lib.js.org/) — write the exported PDF

## Run locally

```bash
npm install
npm run dev
```

## How to use

1. Drop a PDF on the upload screen.
2. Click **+ Text** (or double-click anywhere on a page) to drop a text box.
3. Drag to move it; double-click to edit; tweak size/color in the toolbar.
4. Click **⬇ Export PDF** to download the edited file.

## Roadmap (next)

- Images & signatures, shapes, highlight/whiteout
- True redaction (remove underlying content, not just cover it)
- Click existing text to edit it in place (overlay trick using PDF.js text layer)
- Page reorder / delete / rotate
- Pro features: cloud save, e-signature with audit trail, OCR
