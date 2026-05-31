import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { renderPdf } from './lib/pdf.js'
import { exportPdf } from './lib/exportPdf.js'
import { applyCommand } from './lib/commands.js'
import UploadZone from './components/UploadZone.jsx'
import Toolbar from './components/Toolbar.jsx'
import PageView from './components/PageView.jsx'
import SignaturePad from './components/SignaturePad.jsx'
import { DOC_FONTS, docFontCss, registerDocFonts } from './lib/docfonts.js'

let idSeq = 1
const newId = () => `obj_${idSeq++}`

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
  const [docFont, setDocFont] = useState('') // applied document-wide font
  const [activePage, setActivePage] = useState(0) // page nearest the viewport center
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
      setObjects([])
      setSelectedId(null)
      setActivePage(0)
      past.current = []
      future.current = []
    } catch (e) {
      console.error(e)
      setError('Could not read that PDF. Try another file.')
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
    const idx = pages[best]?.pageIndex
    if (idx != null && idx !== activePage) setActivePage(idx)
  }

  function addText(pageIndex = activePage, x = 60, y = 60) {
    dispatch({ type: 'addText', pageIndex, x, y })
  }

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
        t.color === '#111111' &&
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
      const bytes = await exportPdf(buffer, pages, objects, fontsRef.current)
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
    setObjects([])
    setSelectedId(null)
    setFileName('')
    setImageMode(false)
    setSelectedRegion(null)
    setSelectMode(false)
    setDocFont('')
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
        busy={busy}
      />
      <div className="canvas-area" data-theme={viewTheme} ref={canvasRef} onScroll={onCanvasScroll}>
        {pages.map((page) => (
          <PageView
            key={page.pageIndex}
            page={page}
            isActive={page.pageIndex === activePage}
            objects={objects.filter((o) => o.pageIndex === page.pageIndex)}
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
            onActivate={setActivePage}
          />
        ))}
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
