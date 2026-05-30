import { useEffect, useRef, useState } from 'react'

const FONTS = ['Caveat', 'Dancing Script']

// Trim a canvas to the bounding box of its non-transparent pixels.
function trim(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const { data } = ctx.getImageData(0, 0, width, height)
  let minX = width, minY = height, maxX = 0, maxY = 0, found = false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (!found) return null
  const pad = 8
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width, maxX + pad)
  maxY = Math.min(height, maxY + pad)
  const w = maxX - minX
  const h = maxY - minY
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d').drawImage(canvas, minX, minY, w, h, 0, 0, w, h)
  return { src: out.toDataURL('image/png'), w, h }
}

export default function SignaturePad({ onConfirm, onClose }) {
  const [tab, setTab] = useState('draw')
  const [typed, setTyped] = useState('')
  const [font, setFont] = useState(FONTS[0])
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  // set up the drawing canvas
  useEffect(() => {
    if (tab !== 'draw') return
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#2b221c'
    dirty.current = false
  }, [tab])

  function pos(e) {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function down(e) {
    drawing.current = true
    const { x, y } = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  function move(e) {
    if (!drawing.current) return
    const { x, y } = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y)
    ctx.stroke()
    dirty.current = true
  }
  function up() {
    drawing.current = false
  }
  function clearCanvas() {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    dirty.current = false
  }

  async function confirm() {
    if (tab === 'draw') {
      if (!dirty.current) return
      const result = trim(canvasRef.current)
      if (result) onConfirm(result)
    } else {
      if (!typed.trim()) return
      await document.fonts.load(`64px "${font}"`)
      const c = document.createElement('canvas')
      const ctx = c.getContext('2d')
      ctx.font = `64px "${font}"`
      const w = Math.ceil(ctx.measureText(typed).width) + 24
      const h = 96
      c.width = w
      c.height = h
      const g = c.getContext('2d')
      g.font = `64px "${font}"`
      g.fillStyle = '#2b221c'
      g.textBaseline = 'middle'
      g.fillText(typed, 12, h / 2)
      onConfirm({ src: c.toDataURL('image/png'), w, h })
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Add your signature</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div className="tabs">
          <button className={tab === 'draw' ? 'on' : ''} onClick={() => setTab('draw')}>Draw</button>
          <button className={tab === 'type' ? 'on' : ''} onClick={() => setTab('type')}>Type</button>
        </div>

        {tab === 'draw' ? (
          <div className="sig-draw">
            <canvas
              ref={canvasRef}
              width={520}
              height={200}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
            />
            <div className="sig-baseline">Sign above</div>
          </div>
        ) : (
          <div className="sig-type">
            <input
              autoFocus
              placeholder="Type your name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className="sig-fonts">
              {FONTS.map((f) => (
                <button
                  key={f}
                  className={`sig-font ${font === f ? 'on' : ''}`}
                  style={{ fontFamily: `"${f}"` }}
                  onClick={() => setFont(f)}
                >
                  {typed || 'Your name'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="modal-foot">
          {tab === 'draw' && <button className="btn ghost" onClick={clearCanvas}>Clear</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={confirm}>Add signature</button>
        </div>
      </div>
    </div>
  )
}
