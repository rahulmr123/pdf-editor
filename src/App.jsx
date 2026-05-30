import { useMemo, useState } from 'react'
import { renderPdf } from './lib/pdf.js'
import { exportPdf } from './lib/exportPdf.js'
import UploadZone from './components/UploadZone.jsx'
import Toolbar from './components/Toolbar.jsx'
import PageView from './components/PageView.jsx'

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

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) || null,
    [objects, selectedId],
  )

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
    } catch (e) {
      console.error(e)
      setError('Could not read that PDF. Try another file.')
    }
  }

  function addText(pageIndex = 0, x = 60, y = 60) {
    const obj = {
      id: newId(),
      type: 'text',
      pageIndex,
      x,
      y,
      text: 'New text',
      fontSize: 18,
      color: '#111111',
    }
    setObjects((prev) => [...prev, obj])
    setSelectedId(obj.id)
  }

  function updateObject(id, patch) {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }

  function deleteObject(id) {
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
  }

  if (!pages.length) return <UploadZone onFile={handleFile} error={error} />

  return (
    <div className="app">
      <Toolbar
        selected={selected}
        onAddText={() => addText(0, 60, 60)}
        onChange={updateObject}
        onExport={handleExport}
        onReset={reset}
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
            onAddText={addText}
          />
        ))}
      </div>
    </div>
  )
}
