import { useRef } from 'react'

// A draggable image (also used for signatures) with aspect-locked corner resize.
const CORNERS = ['tl', 'tr', 'bl', 'br']

export default function ImageBox({ obj, selected, onSelect, onChange, onDelete, onGestureStart }) {
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
      mode: 'resize',
      corner,
      sx: e.clientX,
      sy: e.clientY,
      ox: obj.x,
      oy: obj.y,
      ow: obj.w,
      oh: obj.h,
      ratio: obj.w / obj.h,
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

    // resize, locking aspect ratio; driven by whichever axis you drag more,
    // with the opposite corner anchored
    const right = g.corner.includes('r')
    const bottom = g.corner.includes('b')
    const aW = right ? dx : -dx
    const aH = bottom ? dy : -dy
    const delta = Math.abs(aW) > Math.abs(aH) ? aW / g.ow : aH / g.oh
    const scale = Math.max(0.05, 1 + delta)
    const newW = Math.max(24, g.ow * scale)
    const newH = newW / g.ratio
    const newX = right ? g.ox : g.ox + (g.ow - newW)
    const newY = bottom ? g.oy : g.oy + (g.oh - newH)
    onChange(obj.id, { x: newX, y: newY, w: newW, h: newH })
  }

  function endGesture(e) {
    gesture.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  return (
    <div
      className={`imagebox ${selected ? 'selected' : ''}`}
      style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
      onPointerDown={startDrag}
      onPointerMove={onMove}
      onPointerUp={endGesture}
    >
      <img src={obj.src} draggable={false} alt="" />

      {selected && (
        <>
          <button
            className="imagebox-del"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(obj.id)
            }}
            title="Delete"
          >
            ×
          </button>
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
