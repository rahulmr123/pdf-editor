import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { renderPdf, renderSinglePage } from './lib/pdf.js'
import { exportPdf } from './lib/exportPdf.js'
import { applyCommand } from './lib/commands.js'
import { ocrPages } from './lib/ocr.js'
import UploadZone from './components/UploadZone.jsx'
import Toolbar from './components/Toolbar.jsx'
import PageView from './components/PageView.jsx'
import PagesPanel from './components/PagesPanel.jsx'
import SignaturePad from './components/SignaturePad.jsx'
import { DOC_FONTS, docFontCss, registerDocFonts } from './lib/docfonts.js'

let idSeq = 1
const newId = () => `obj_${idSeq++}`

// Inserted blank pages get unique negative indices so they never collide with
// the source PDF's 0..n-1 page indices (or with each other).
let blankSeq = -1

export default function App() {
  const [fileName, setFileName] = useState('')
  const [buffer, setBuffer] = useState(null) // original ArrayBuffer, kept pristine
  const [pages, setPages] = useState([])
  const [objects, setObjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSig, setShowSig] = useState(false)
  const [imageMode, setImageMode] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(null)
  const [viewTheme, setViewTheme] = useState('normal')
  const [selectMode, setSelectMode] = useState(false)
  const [cutMode, setCutMode] = useState(false) // drag a box to lift it out of the scan
  const [redactMode, setRedactMode] = useState(false) // drag a box to truly remove content
  const [docFont, setDocFont] = useState('') // applied document-wide font
  const [activePage, setActivePage] = useState(0) // page nearest the viewport center
  const [pageOrder, setPageOrder] = useState([]) // displayed sequence of source page indices
  const [showPages, setShowPages] = useState(true) // Pages panel visibility
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrRan, setOcrRan] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(null) // { page, total, ratio }
  const [fieldValues, setFieldValues] = useState({}) // AcroForm field name -> value
  const canvasRef = useRef(null)
  const replaceTarget = useRef(null)
  const replaceInputRef = useRef(null)
  const pendingEdit = useRef(null) // a click-to-edit that's reverted if left unchanged
  const fontsRef = useRef({}) // embedded font programs from the PDF (for exact reuse)
  const loadedFontNames = useRef(new Set())

  // Load the PDF's embedded fonts into the browser so edited text renders in
  // the exact same typeface on screen.
  function loadFontFaces(fonts) {
    if (!document.fonts) return
    for (const [name, info] of Object.entries(fonts)) {
      if (loadedFontNames.current.has(name)) continue
      loadedFontNames.current.add(name)
      try {
        const ff = new FontFace(name, info.data)
        ff.load()
          .then((loaded) => document.fonts.add(loaded))
          .catch(() => {})
      } catch {}
    }
  }

  // Undo / redo history of the objects array.
  const past = useRef([])
  const future = useRef([])
  const [, tick] = useReducer((x) => x + 1, 0)

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) || null,
    [objects, selectedId],
  )

  const pageById = useMemo(
    () => new Map(pages.map((p) => [p.pageIndex, p])),
    [pages],
  )

  // Pages with no extractable text are scanned/image-only — OCR can make them
  // editable. Offer it until OCR has run.
  const scannedCount = useMemo(
    () => pages.filter((p) => !p.blank && !p.textItems?.length).length,
    [pages],
  )

  function snapshot() {
    past.current.push(objects)
    if (past.current.length > 100) past.current.shift()
    future.current = []
    tick()
  }

  function undo() {
    if (!past.current.length) return
    future.current.push(objects)
    setObjects(past.current.pop())
    setSelectedId(null)
    tick()
  }

  function redo() {
    if (!future.current.length) return
    past.current.push(objects)
    setObjects(future.current.pop())
    setSelectedId(null)
    tick()
  }

  // The single path through which every document change flows. The toolbar,
  // the future ⌘K palette, and the future AI agent all just emit commands;
  // applyCommand is the only place the objects array is transformed.
  //   history:false → a live/transient update (e.g. mid-drag) that shouldn't
  //   create its own undo step (the gesture snapshots once at the start).
  function dispatch(cmd, { history = true } = {}) {
    const result = applyCommand(objects, cmd, { newId, pages })
    if (result.objects === objects) return result // no-op: no history, no render
    if (history) snapshot()
    setObjects(result.objects)
    if ('selectId' in result) setSelectedId(result.selectId)
    return result
  }

  async function handleFile(file) {
    setError('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const { pages: rendered, fonts } = await renderPdf(arrayBuffer)
      fontsRef.current = fonts
      loadFontFaces(fonts)
      setBuffer(arrayBuffer)
      setFileName(file.name)
      setPages(rendered)
      setPageOrder(rendered.map((p) => p.pageIndex))
      // seed form values from any existing AcroForm field values
      const fv = {}
      for (const p of rendered)
        for (const f of p.formFields || []) {
          if (f.type === 'checkbox') fv[f.name] = f.checked
          else if (f.type === 'radio') { if (f.checked) fv[f.name] = f.value } // one option per group
          else fv[f.name] = f.value
        }
      setFieldValues(fv)
      setObjects([])
      setSelectedId(null)
      setActivePage(rendered[0]?.pageIndex ?? 0)
      setOcrRan(false)
      setOcrProgress(null)
      past.current = []
      future.current = []
    } catch (e) {
      console.error(e)
      setError('Could not read that PDF. Try another file.')
    }
  }

  // OCR every scanned page and merge the recognised words into its textItems,
  // so existing-text editing works on scanned PDFs just like digital ones.
  async function runOcr() {
    const targets = pages.filter((p) => !p.blank && !p.textItems?.length)
    if (!targets.length || ocrBusy) return
    setOcrBusy(true)
    setOcrProgress({ page: 0, total: targets.length, ratio: 0 })
    try {
      const results = await ocrPages(targets, setOcrProgress)
      const byIdx = new Map(results.map((r) => [r.pageIndex, r.textItems]))
      setPages((prev) =>
        prev.map((p) => (byIdx.has(p.pageIndex) ? { ...p, textItems: byIdx.get(p.pageIndex), ocr: true } : p)),
      )
    } catch (e) {
      console.error(e)
      setError('Text recognition failed — see console.')
    } finally {
      setOcrRan(true)
      setOcrBusy(false)
      setOcrProgress(null)
    }
  }

  // The page whose center is closest to the viewport center is "active" — new
  // objects land there, so what you add appears on the page you're looking at.
  function onCanvasScroll() {
    const el = canvasRef.current
    if (!el) return
    const crect = el.getBoundingClientRect()
    const mid = crect.top + crect.height / 2
    let best = 0
    let bestDist = Infinity
    el.querySelectorAll('.page-wrap').forEach((w, i) => {
      const r = w.getBoundingClientRect()
      const d = Math.abs(r.top + r.height / 2 - mid)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    // DOM order follows pageOrder, so map the nearest wrap back to its src index.
    const idx = pageOrder[best]
    if (idx != null && idx !== activePage) setActivePage(idx)
  }

  // Scroll a page into view (used by the Pages panel) and make it active.
  function goToPage(srcIndex) {
    setActivePage(srcIndex)
    document.getElementById(`pw-${srcIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Insert a blank page right after the active one. It matches the active page's
  // dimensions so it slots in seamlessly, and becomes a real blank page on export.
  function addBlankPage() {
    const ref = pageById.get(activePage) || pages[0]
    const width = ref?.width ?? 820
    const height = ref?.height ?? Math.round((820 * 792) / 612)
    const pdfWidth = ref?.pdfWidth ?? 612
    const pdfHeight = ref?.pdfHeight ?? 792
    const scale = ref?.scale ?? width / pdfWidth
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    const pageIndex = blankSeq--
    const blank = {
      pageIndex, blank: true, scale, width, height, pdfWidth, pdfHeight,
      dataUrl: canvas.toDataURL('image/png'), textItems: [], imageRegions: [],
    }
    setPages((prev) => [...prev, blank])
    setPageOrder((order) => {
      const pos = order.indexOf(activePage)
      const next = [...order]
      next.splice(pos === -1 ? order.length : pos + 1, 0, pageIndex)
      return next
    })
    setActivePage(pageIndex)
    requestAnimationFrame(() =>
      document.getElementById(`pw-${pageIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  // Reorder pages: move the page at `from` (display position) to `to`.
  function movePage(from, to) {
    if (from === to) return
    setPageOrder((order) => {
      const next = [...order]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  // Drop a page from the document (kept in `pages`, just excluded from the
  // output and the view). Its overlay objects are dropped from export too.
  function deletePage(srcIndex) {
    if (pageOrder.length <= 1) return // never delete the last remaining page
    const next = pageOrder.filter((s) => s !== srcIndex)
    setPageOrder(next)
    if (srcIndex === activePage) setActivePage(next[0] ?? 0)
  }

  // Rotate a page 90° clockwise. We re-render it from the PDF in the new
  // orientation (so the raster, text boxes and editing all stay correct) and
  // swing any overlay objects already on it into the rotated coordinate space.
  async function rotatePage(srcIndex) {
    const cur = pageById.get(srcIndex)
    if (!cur || !buffer) return
    const oldH = cur.height
    const next = ((cur.rotation || 0) + 90) % 360
    try {
      const { record, fonts } = await renderSinglePage(buffer, srcIndex, next)
      fontsRef.current = { ...fontsRef.current, ...fonts }
      loadFontFaces(fonts)
      setPages((prev) => prev.map((p) => (p.pageIndex === srcIndex ? { pageIndex: srcIndex, ...record } : p)))
      // +90° CW on a (W×oldH) page: (x,y,w,h) -> (oldH - y - h, x, h, w)
      setObjects((prev) =>
        prev.map((o) => {
          if (o.pageIndex !== srcIndex) return o
          const w = o.w ?? o.fontSize ?? 0
          const h = o.h ?? o.fontSize ?? 0
          const patch = { x: oldH - o.y - h, y: o.x }
          if (o.w != null) { patch.w = h; patch.h = w }
          return { ...o, ...patch }
        }),
      )
      setSelectedId(null)
    } catch (e) {
      console.error('rotate failed', e)
      setError('Could not rotate that page.')
    }
  }

  function addText(pageIndex = activePage, x = 60, y = 60) {
    dispatch({ type: 'addText', pageIndex, x, y })
  }

  const setFieldValue = (name, value) => setFieldValues((prev) => ({ ...prev, [name]: value }))

  // Click existing PDF text -> cover it and drop a matching editable box on top.
  function editExisting(pageIndex, item) {
    resolvePending()
    setActivePage(pageIndex)
    const result = dispatch({ type: 'editTextRun', pageIndex, item })
    setSelectedRegion(null)
    pendingEdit.current = result.pending || null
  }

  // Place an image/signature, scaled to a sensible default width, on page 1.
  function placeImage({ src, w, h }, maxW = 260) {
    const scale = Math.min(1, maxW / w)
    dispatch({ type: 'addImage', pageIndex: activePage, x: 80, y: 120, w: w * scale, h: h * scale, src })
  }

  function toggleSelectMode() {
    setSelectMode((s) => !s)
    setSelectedId(null)
    setSelectedRegion(null)
    setImageMode(false)
    setCutMode(false)
    setRedactMode(false)
  }

  // Redact mode: drag a box over anything (text or image) to truly remove it.
  // The covered area's content is destroyed on export, not merely hidden.
  function toggleRedactMode() {
    setRedactMode((r) => !r)
    setSelectedId(null)
    setSelectedRegion(null)
    setImageMode(false)
    setSelectMode(false)
    setCutMode(false)
  }

  // Marquee released in redact mode -> drop a redaction box over that rectangle.
  function redactArea(pageIndex, rect) {
    setRedactMode(false)
    const obj = {
      id: newId(), type: 'redaction', pageIndex,
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    }
    dispatch({ type: 'addObjects', objects: [obj], selectId: obj.id })
  }

  // Cut-out mode: drag a box around a signature, seal or stamp on a scanned
  // page and lift it into a movable/resizable/deletable object.
  function toggleCutMode() {
    setCutMode((c) => !c)
    setSelectedId(null)
    setSelectedRegion(null)
    setImageMode(false)
    setSelectMode(false)
    setRedactMode(false)
  }

  // Marquee released in cut mode -> lift that rectangle of the page raster.
  function cutOut(pageIndex, rect) {
    setCutMode(false)
    liftRegion({ pageIndex, x: rect.x, y: rect.y, width: rect.w, height: rect.h })
  }

  // Restyle the WHOLE document in a chosen font: cover every original text run
  // and redraw it in the bundled font (shrunk to fit so tables stay tidy).
  async function applyDocumentFont(key) {
    setSelectedId(null)
    setSelectedRegion(null)
    if (!key) {
      dispatch({ type: 'clearDocRestyle' })
      setDocFont('')
      return
    }
    registerDocFonts()
    const family = docFontCss(key)
    const cat = DOC_FONTS[key]?.category || 'sans'
    try {
      await document.fonts.load(`16px ${family}`)
      await document.fonts.load(`700 16px ${family}`)
    } catch {}
    const ctx = document.createElement('canvas').getContext('2d')
    const next = []
    for (const page of pages) {
      for (const it of page.textItems || []) {
        next.push({
          id: newId(), type: 'whiteout', pageIndex: page.pageIndex,
          x: it.x - 1, y: it.y - 1, w: it.width + 2, h: it.height + 2,
          color: '#ffffff', docRestyle: true,
        })
        let size = it.fontSize
        ctx.font = `${it.fontBold ? '700' : '400'} ${size}px ${family}`
        const w = ctx.measureText(it.str).width
        if (w > it.width && w > 0) size = Math.max(4, size * (it.width / w))
        next.push({
          id: newId(), type: 'text', pageIndex: page.pageIndex,
          x: it.x, y: it.y, text: it.str, fontSize: size,
          color: '#111111', bold: !!it.fontBold, italic: false, bgColor: 'none',
          font: cat, docFontKey: key, docFontFamily: family, docRestyle: true,
        })
      }
    }
    dispatch({ type: 'replaceDocRestyle', objects: next })
    setDocFont(key)
  }

  // Drag-select a region of original text -> grab every run inside it as one
  // editable, multi-line block (e.g. a full address), and cover the original.
  function areaSelect(pageIndex, rect) {
    resolvePending()
    setActivePage(pageIndex)
    setSelectMode(false)
    const result = dispatch({ type: 'selectArea', pageIndex, rect })
    setSelectedRegion(null)
    pendingEdit.current = result.pending || null
  }

  function addHighlight() {
    dispatch({ type: 'addHighlight', pageIndex: activePage, x: 80, y: 120, w: 180, h: 26 })
  }

  function handleImageFile(file) {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => placeImage({ src: reader.result, w: img.naturalWidth, h: img.naturalHeight })
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  // If a click-to-edit was left untouched (same text, default styling), revert
  // it so merely clicking text never changes how it looks. This is a net-zero
  // cleanup of an uncommitted edit, so it stays out of the command/history path.
  function resolvePending() {
    const p = pendingEdit.current
    if (!p) return
    pendingEdit.current = null
    setObjects((prev) => {
      const t = prev.find((o) => o.id === p.textId)
      if (!t) return prev
      const unchanged =
        t.text === p.originalText &&
        t.bold === p.originalBold &&
        t.italic === p.originalItalic &&
        t.font === p.originalFont &&
        t.color === (p.originalColor || '#111111') &&
        (!t.bgColor || t.bgColor === 'none') &&
        Math.round(t.fontSize) === Math.round(p.originalFontSize)
      return unchanged
        ? prev.filter((o) => o.id !== p.textId && !p.whiteoutIds.includes(o.id))
        : prev
    })
  }

  // selecting an object clears a selected image region and vice-versa
  function selectObject(id) {
    if (pendingEdit.current && id !== pendingEdit.current.textId) resolvePending()
    setSelectedId(id)
    if (id !== null) setSelectedRegion(null)
  }
  function selectRegion(r) {
    if (pendingEdit.current) resolvePending()
    setSelectedRegion(r)
    if (r) setSelectedId(null)
  }

  function toggleImageMode() {
    setImageMode((m) => !m)
    setSelectedRegion(null)
    setSelectedId(null)
    setSelectMode(false)
    setCutMode(false)
    setRedactMode(false)
  }

  // "Remove" a detected image = cover it with a whiteout (baked on export).
  function removeRegion(region) {
    dispatch({ type: 'redactRegion', region })
    setSelectedRegion(null)
  }

  function replaceRegion(region) {
    replaceTarget.current = { kind: 'region', region }
    replaceInputRef.current?.click()
  }

  function replaceImage(id) {
    replaceTarget.current = { kind: 'object', id }
    replaceInputRef.current?.click()
  }

  // "Lift" a detected image into a movable/resizable object: crop it out of the
  // rendered page, cover the original, and drop the crop as an image object.
  function liftRegion(region) {
    const page = pages.find((p) => p.pageIndex === region.pageIndex)
    if (!page) return
    const image = new Image()
    image.onload = () => {
      const w = Math.max(1, Math.round(region.width))
      const h = Math.max(1, Math.round(region.height))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas
        .getContext('2d')
        .drawImage(image, region.x, region.y, region.width, region.height, 0, 0, w, h)
      const src = canvas.toDataURL('image/png')
      const whiteoutObj = {
        id: newId(), type: 'whiteout', pageIndex: region.pageIndex,
        x: region.x, y: region.y, w: region.width, h: region.height, color: '#ffffff',
      }
      const imgObj = {
        id: newId(), type: 'image', pageIndex: region.pageIndex,
        x: region.x, y: region.y, w: region.width, h: region.height, src,
      }
      dispatch({ type: 'addObjects', objects: [whiteoutObj, imgObj], selectId: imgObj.id })
      setSelectedRegion(null)
    }
    image.src = page.dataUrl
  }

  function handleReplaceFile(file) {
    const t = replaceTarget.current
    if (!t) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        if (t.kind === 'region') {
          const region = t.region
          const s = Math.min(region.width / img.naturalWidth, region.height / img.naturalHeight)
          const w = img.naturalWidth * s
          const h = img.naturalHeight * s
          const imgId = newId()
          const whiteoutObj = {
            id: newId(), type: 'whiteout', pageIndex: region.pageIndex,
            x: region.x, y: region.y, w: region.width, h: region.height, color: '#ffffff',
          }
          const imgObj = {
            id: imgId, type: 'image', pageIndex: region.pageIndex,
            x: region.x + (region.width - w) / 2,
            y: region.y + (region.height - h) / 2,
            w, h, src: reader.result,
          }
          dispatch({ type: 'addObjects', objects: [whiteoutObj, imgObj], selectId: imgId })
        } else {
          // swap an existing image object's src, keeping width and matching aspect
          const target = objects.find((o) => o.id === t.id)
          const aspect = img.naturalHeight / img.naturalWidth
          dispatch({
            type: 'updateObject',
            id: t.id,
            patch: { src: reader.result, ...(target ? { h: target.w * aspect } : {}) },
          })
        }
        setSelectedRegion(null)
        replaceTarget.current = null
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  function updateObject(id, patch) {
    dispatch({ type: 'updateObject', id, patch }, { history: false })
  }

  function deleteObject(id) {
    dispatch({ type: 'deleteObjects', ids: [id] })
  }

  async function handleExport() {
    setBusy(true)
    try {
      const bytes = await exportPdf(buffer, pages, objects, fontsRef.current, pageOrder, fieldValues)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName.replace(/\.pdf$/i, '') + '-edited.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      setError('Export failed — see console.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setBuffer(null)
    setPages([])
    setPageOrder([])
    setObjects([])
    setSelectedId(null)
    setFileName('')
    setImageMode(false)
    setSelectedRegion(null)
    setSelectMode(false)
    setCutMode(false)
    setRedactMode(false)
    setDocFont('')
    setOcrBusy(false)
    setOcrRan(false)
    setOcrProgress(null)
    setFieldValues({})
    past.current = []
    future.current = []
  }

  // Keyboard: undo/redo + delete selected (ignored while typing in a field).
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName
      const typing = tag === 'TEXTAREA' || tag === 'INPUT'
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return // let the field handle its own undo
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteObject(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [objects, selectedId])

  // preload bundled document fonts
  useEffect(() => {
    registerDocFonts()
  }, [])

  if (!pages.length) return <UploadZone onFile={handleFile} error={error} />

  return (
    <div className="app">
      <Toolbar
        selected={selected}
        onAddText={() => addText()}
        onImageFile={handleImageFile}
        onAddSignature={() => setShowSig(true)}
        onAddHighlight={addHighlight}
        selectMode={selectMode}
        onToggleSelectMode={toggleSelectMode}
        cutMode={cutMode}
        onToggleCutMode={toggleCutMode}
        redactMode={redactMode}
        onToggleRedactMode={toggleRedactMode}
        imageMode={imageMode}
        onToggleImageMode={toggleImageMode}
        viewTheme={viewTheme}
        onViewTheme={setViewTheme}
        docFont={docFont}
        onApplyDocFont={applyDocumentFont}
        onChange={updateObject}
        onExport={handleExport}
        onReset={reset}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.current.length > 0}
        canRedo={future.current.length > 0}
        showPages={showPages}
        onTogglePages={() => setShowPages((s) => !s)}
        busy={busy}
      />

      {(ocrBusy || (scannedCount > 0 && !ocrRan)) && (
        <div className="ocr-bar">
          {ocrBusy ? (
            <>
              <span className="ocr-spinner" />
              <span>
                Recognising text — page {(ocrProgress?.page ?? 0) + 1} of {ocrProgress?.total ?? scannedCount}
                {ocrProgress ? ` · ${Math.round(ocrProgress.ratio * 100)}%` : ''}
              </span>
            </>
          ) : (
            <>
              <span>
                ✦ This looks like a scanned PDF — {scannedCount} page{scannedCount > 1 ? 's' : ''} have no
                selectable text. You can still add text, signatures and images on top.
              </span>
              <button className="btn primary sm" onClick={runOcr}>
                Make text editable (OCR)
              </button>
            </>
          )}
        </div>
      )}

      <div className="workspace">
        {showPages && (
          <PagesPanel
            pageOrder={pageOrder}
            pageById={pageById}
            activePage={activePage}
            onGoToPage={goToPage}
            onMovePage={movePage}
            onDeletePage={deletePage}
            onAddPage={addBlankPage}
            onRotatePage={rotatePage}
          />
        )}
        <div className="canvas-area" data-theme={viewTheme} ref={canvasRef} onScroll={onCanvasScroll}>
          {pageOrder.map((srcIndex, pos) => {
            const page = pageById.get(srcIndex)
            if (!page) return null
            return (
              <PageView
                key={srcIndex}
                page={page}
                pageNumber={pos + 1}
                isActive={srcIndex === activePage}
                objects={objects.filter((o) => o.pageIndex === srcIndex)}
                selectedId={selectedId}
                onSelect={selectObject}
                onChange={updateObject}
                onDelete={deleteObject}
                onEditExisting={editExisting}
                onDragStart={snapshot}
                onEditStart={snapshot}
                onGestureStart={snapshot}
                imageMode={imageMode}
                selectedRegion={selectedRegion}
                onSelectRegion={selectRegion}
                onRemoveRegion={removeRegion}
                onReplaceRegion={replaceRegion}
                onLiftRegion={liftRegion}
                onReplaceImage={replaceImage}
                selectMode={selectMode}
                onAreaSelect={areaSelect}
                cutMode={cutMode}
                onCutOut={cutOut}
                redactMode={redactMode}
                onRedact={redactArea}
                fieldValues={fieldValues}
                onFieldChange={setFieldValue}
                onActivate={setActivePage}
              />
            )
          })}
        </div>
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleReplaceFile(f)
          e.target.value = ''
        }}
      />

      {showSig && (
        <SignaturePad
          onClose={() => setShowSig(false)}
          onConfirm={(result) => {
            setShowSig(false)
            placeImage(result, 240)
          }}
        />
      )}
    </div>
  )
}
