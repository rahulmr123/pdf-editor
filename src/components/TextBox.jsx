import { useRef } from 'react'

// Display + drag + select only. Editing happens in the floating TextPopup.
export default function TextBox({ obj, selected, onSelect, onChange, onDragStart }) {
  const drag = useRef(null)

  function onPointerDown(e) {
    e.stopPropagation()
    onSelect(obj.id)
    onDragStart?.()
    drag.current = { sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.sx
    const dy = e.clientY - drag.current.sy
    onChange(obj.id, {
      x: Math.max(0, drag.current.ox + dx),
      y: Math.max(0, drag.current.oy + dy),
    })
  }

  function onPointerUp(e) {
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  return (
    <div
      className={`textbox ${selected ? 'selected' : ''}`}
      style={{
        left: obj.x,
        top: obj.y,
        fontSize: obj.fontSize,
        color: obj.color,
        fontWeight: obj.bold ? 700 : 400,
        fontStyle: obj.italic ? 'italic' : 'normal',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span>{obj.text || ' '}</span>
    </div>
  )
}
