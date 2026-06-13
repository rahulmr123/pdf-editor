import { useRef } from 'react'

const CORNERS = ['tl', 'tr', 'bl', 'br']

// A movable, resizable solid-black redaction box. Unlike a whiteout cover, on
// export the page beneath it is flattened to a raster with this area blacked
// out, so the original text/image under it is truly removed — not just hidden.
export default function RedactionBox({ obj, selected, onSelect, onChange, onDelete, onGestureStart }) {
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
    const newW = Math.max(12, right ? g.ow + dx : g.ow - dx)
    const newH = Math.max(8, bottom ? g.oh + dy : g.oh - dy)
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
      className={`redactionbox ${selected ? 'selected' : ''}`}
      style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
      title="Redacted — content beneath is removed on export"
      onPointerDown={startDrag}
      onPointerMove={onMove}
      onPointerUp={endGesture}
    >
      {selected && (
        <>
          <div className="rb-bar" onPointerDown={(e) => e.stopPropagation()}>
            <span className="rb-tag">REDACTED</span>
            <button className="rb-del" onClick={(e) => { e.stopPropagation(); onDelete(obj.id) }} title="Delete">
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
