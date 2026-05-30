import { useRef } from 'react'

const CORNERS = ['tl', 'tr', 'bl', 'br']
const SWATCHES = ['#FFE600', '#A6F0A6', '#FFB3D1', '#A9D8FF', '#FFC98A']

function rgba(hex, a) {
  const m = hex.replace('#', '')
  const n = parseInt(m.length === 3 ? m.replace(/(.)/g, '$1$1') : m, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// A movable, freely-resizable semi-transparent highlight rectangle.
export default function HighlightBox({ obj, selected, onSelect, onChange, onDelete, onGestureStart }) {
  const gesture = useRef(null)

  function startDrag(e) {
    e.stopPropagation()
    onSelect(obj.id)
    onGestureStart?.()
    gesture.current = { mode: 'move', sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function startResize(e, corner) {
    e.stopPropagation()
    onSelect(obj.id)
    onGestureStart?.()
    gesture.current = {
      mode: 'resize', corner,
      sx: e.clientX, sy: e.clientY,
      ox: obj.x, oy: obj.y, ow: obj.w, oh: obj.h,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onMove(e) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    if (g.mode === 'move') {
      onChange(obj.id, { x: Math.max(0, g.ox + dx), y: Math.max(0, g.oy + dy) })
      return
    }
    const right = g.corner.includes('r')
    const bottom = g.corner.includes('b')
    const newW = Math.max(16, right ? g.ow + dx : g.ow - dx)
    const newH = Math.max(10, bottom ? g.oh + dy : g.oh - dy)
    onChange(obj.id, {
      x: right ? g.ox : g.ox + (g.ow - newW),
      y: bottom ? g.oy : g.oy + (g.oh - newH),
      w: newW,
      h: newH,
    })
  }

  function endGesture(e) {
    gesture.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  return (
    <div
      className={`highlightbox ${selected ? 'selected' : ''}`}
      style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h, background: rgba(obj.color, obj.opacity) }}
      onPointerDown={startDrag}
      onPointerMove={onMove}
      onPointerUp={endGesture}
    >
      {selected && (
        <>
          <div className="hl-bar" onPointerDown={(e) => e.stopPropagation()}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`hl-swatch ${obj.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
                style={{ background: c }}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(obj.id, { color: c })
                }}
              />
            ))}
            <span className="hl-sep" />
            <button className="hl-del" onClick={(e) => { e.stopPropagation(); onDelete(obj.id) }} title="Delete">
              ✕
            </button>
          </div>
          {CORNERS.map((c) => (
            <span
              key={c}
              className={`handle ${c}`}
              onPointerDown={(e) => startResize(e, c)}
              onPointerMove={onMove}
              onPointerUp={endGesture}
            />
          ))}
        </>
      )}
    </div>
  )
}
