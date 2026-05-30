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
    }
    setObjects((prev) => [...prev, obj])
    setSelectedId(obj.id)
  }

  // Click existing PDF text -> cover it and drop a matching editable box on top.
  function editExisting(pageIndex, item) {
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
    }
    setObjects((prev) => [...prev, whiteout, text])
    setSelectedId(text.id)
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

  function handleImageFile(file) {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => placeImage({ src: reader.result, w: img.naturalWidth, h: img.naturalHeight })
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
        onChange={updateObject}
        onExport={handleExport}
        onReset={reset}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.current.length > 0}
        canRedo={future.current.length > 0}
        busy={busy}
      />
      <div className="canvas-area">
        {pages.map((page) => (
          <PageView
            key={page.pageIndex}
            page={page}
            objects={objects.filter((o) => o.pageIndex === page.pageIndex)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updateObject}
            onDelete={deleteObject}
            onEditExisting={editExisting}
            onDragStart={snapshot}
            onEditStart={snapshot}
            onGestureStart={snapshot}
          />
        ))}
      </div>

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
