import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { renderPdf } from './lib/pdf.js'
import { exportPdf } from './lib/exportPdf.js'
import UploadZone from './components/UploadZone.jsx'
import Toolbar from './components/Toolbar.jsx'
import PageView from './components/PageView.jsx'
import SignaturePad from './components/SignaturePad.jsx'

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
  const replaceTarget = useRef(null)
  const replaceInputRef = useRef(null)
  const pendingEdit = useRef(null) // a click-to-edit that's reverted if left unchanged

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

  async function handleFile(file) {
    setError('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const rendered = await renderPdf(arrayBuffer)
      setBuffer(arrayBuffer)
      setFileName(file.name)
      setPages(rendered)
      setObjects([])
      setSelectedId(null)
      past.current = []
      future.current = []
    } catch (e) {
      console.error(e)
      setError('Could not read that PDF. Try another file.')
    }
  }

  function addText(pageIndex = 0, x = 60, y = 60) {
    snapshot()
    const obj = {
      id: newId(),
      type: 'text',
      pageIndex,
      x,
      y,
      text: 'New text',
      fontSize: 18,
      color: '#111111',
      bold: false,
      italic: false,
      bgColor: 'none',
    }
    setObjects((prev) => [...prev, obj])
    setSelectedId(obj.id)
  }

  // Click existing PDF text -> cover it and drop a matching editable box on top.
  function editExisting(pageIndex, item) {
    resolvePending()
    snapshot()
    const pad = 1
    const whiteout = {
      id: newId(),
      type: 'whiteout',
      pageIndex,
      x: item.x - pad,
      y: item.y - pad,
      w: item.width + pad * 2,
      h: item.height + pad * 2,
      color: '#ffffff',
    }
    const text = {
      id: newId(),
      type: 'text',
      pageIndex,
      x: item.x,
      y: item.y,
      text: item.str,
      fontSize: item.fontSize,
      color: '#111111',
      bold: false,
      italic: false,
      bgColor: 'none',
    }
    setObjects((prev) => [...prev, whiteout, text])
    setSelectedId(text.id)
    setSelectedRegion(null)
    pendingEdit.current = {
      textId: text.id,
      whiteoutId: whiteout.id,
      originalText: item.str,
      originalFontSize: item.fontSize,
    }
  }

  // Place an image/signature, scaled to a sensible default width, on page 1.
  function placeImage({ src, w, h }, maxW = 260) {
    snapshot()
    const scale = Math.min(1, maxW / w)
    const obj = {
      id: newId(),
      type: 'image',
      pageIndex: 0,
      x: 80,
      y: 120,
      w: w * scale,
      h: h * scale,
      src,
    }
    setObjects((prev) => [...prev, obj])
    setSelectedId(obj.id)
  }

  function toggleSelectMode() {
    setSelectMode((s) => !s)
    setSelectedId(null)
    setSelectedRegion(null)
    setImageMode(false)
  }

  // Drag-select a region of original text -> grab every run inside it as one
  // editable, multi-line block (e.g. a full address), and cover the original.
  function areaSelect(pageIndex, rect) {
    resolvePending()
    const page = pages.find((p) => p.pageIndex === pageIndex)
    setSelectMode(false)
    if (!page) return

    const items = (page.textItems || []).filter(
      (it) =>
        !(
          it.x > rect.x + rect.w ||
          it.x + it.width < rect.x ||
          it.y > rect.y + rect.h ||
          it.y + it.height < rect.y
        ),
    )
    if (!items.length) return

    // group runs into lines by vertical position, then order each line by x
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
    const lines = []
    for (const it of sorted) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(it.y - last.y) < it.height * 0.6) {
        last.items.push(it)
        last.y = Math.min(last.y, it.y)
      } else {
        lines.push({ y: it.y, items: [it] })
      }
    }
    const text = lines
      .map((l) =>
        l.items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.str)
          .join(' '),
      )
      .join('\n')

    const minX = Math.min(...items.map((i) => i.x))
    const minY = Math.min(...items.map((i) => i.y))
    const maxX = Math.max(...items.map((i) => i.x + i.width))
    const maxY = Math.max(...items.map((i) => i.y + i.height))
    const fontSize = sorted[0].fontSize

    snapshot()
    const pad = 2
    const whiteout = {
      id: newId(),
      type: 'whiteout',
      pageIndex,
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
      color: '#ffffff',
    }
    const textObj = {
      id: newId(),
      type: 'text',
      pageIndex,
      x: minX,
      y: minY,
      text,
      fontSize,
      color: '#111111',
      bold: false,
      italic: false,
      bgColor: 'none',
    }
    setObjects((prev) => [...prev, whiteout, textObj])
    setSelectedId(textObj.id)
    setSelectedRegion(null)
  }

  function addHighlight() {
    snapshot()
    const obj = {
      id: newId(),
      type: 'highlight',
      pageIndex: 0,
      x: 80,
      y: 120,
      w: 180,
      h: 26,
      color: '#FFE600',
      opacity: 0.4,
    }
    setObjects((prev) => [...prev, obj])
    setSelectedId(obj.id)
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

  // If a click-to-edit was left untouched (same text, default styling), undo it
  // so merely clicking text never changes how it looks.
  function resolvePending() {
    const p = pendingEdit.current
    if (!p) return
    pendingEdit.current = null
    setObjects((prev) => {
      const t = prev.find((o) => o.id === p.textId)
      if (!t) return prev
      const unchanged =
        t.text === p.originalText &&
        !t.bold &&
        !t.italic &&
        t.color === '#111111' &&
        (!t.bgColor || t.bgColor === 'none') &&
        Math.round(t.fontSize) === Math.round(p.originalFontSize)
      return unchanged ? prev.filter((o) => o.id !== p.textId && o.id !== p.whiteoutId) : prev
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
    snapshot()
    setObjects((prev) => [
      ...prev,
      {
        id: newId(),
        type: 'whiteout',
        pageIndex: region.pageIndex,
        x: region.x,
        y: region.y,
        w: region.width,
        h: region.height,
        color: '#ffffff',
      },
    ])
    setSelectedRegion(null)
  }

  function replaceRegion(region) {
    replaceTarget.current = region
    replaceInputRef.current?.click()
  }

  function handleReplaceFile(file) {
    const region = replaceTarget.current
    if (!region) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        snapshot()
        const s = Math.min(region.width / img.naturalWidth, region.height / img.naturalHeight)
        const w = img.naturalWidth * s
        const h = img.naturalHeight * s
        setObjects((prev) => [
          ...prev,
          {
            id: newId(),
            type: 'whiteout',
            pageIndex: region.pageIndex,
            x: region.x,
            y: region.y,
            w: region.width,
            h: region.height,
            color: '#ffffff',
          },
          {
            id: newId(),
            type: 'image',
            pageIndex: region.pageIndex,
            x: region.x + (region.width - w) / 2,
            y: region.y + (region.height - h) / 2,
            w,
            h,
            src: reader.result,
          },
        ])
        setSelectedRegion(null)
        replaceTarget.current = null
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  function updateObject(id, patch) {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }

  function deleteObject(id) {
    snapshot()
    setObjects((prev) => prev.filter((o) => o.id !== id))
    setSelectedId(null)
  }

  async function handleExport() {
    setBusy(true)
    try {
      const bytes = await exportPdf(buffer, pages, objects)
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

  if (!pages.length) return <UploadZone onFile={handleFile} error={error} />

  return (
    <div className="app">
      <Toolbar
        selected={selected}
        onAddText={() => addText(0, 60, 60)}
        onImageFile={handleImageFile}
        onAddSignature={() => setShowSig(true)}
        onAddHighlight={addHighlight}
        selectMode={selectMode}
        onToggleSelectMode={toggleSelectMode}
        imageMode={imageMode}
        onToggleImageMode={toggleImageMode}
        viewTheme={viewTheme}
        onViewTheme={setViewTheme}
        onChange={updateObject}
        onExport={handleExport}
        onReset={reset}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.current.length > 0}
        canRedo={future.current.length > 0}
        busy={busy}
      />
      <div className="canvas-area" data-theme={viewTheme}>
        {pages.map((page) => (
          <PageView
            key={page.pageIndex}
            page={page}
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
            selectMode={selectMode}
            onAreaSelect={areaSelect}
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
