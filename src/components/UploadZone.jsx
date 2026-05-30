import { useRef, useState } from 'react'

export default function UploadZone({ onFile, error }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  function pick(files) {
    const file = files?.[0]
    if (file && file.type === 'application/pdf') onFile(file)
  }

  return (
    <div className="upload-screen">
      <div
        className={`dropzone ${drag ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          pick(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dz-icon">📄</div>
        <h1>Drop a PDF to start editing</h1>
        <p>Everything happens in your browser — your file never leaves your device.</p>
        <button className="btn primary">Choose PDF</button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => pick(e.target.files)}
        />
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
