import { useEffect, useRef, useState } from 'react'

// A draggable, editable text overlay. Drag to move, double-click to edit.
export default function TextBox({ obj, selected, onSelect, onChange, onDelete, onDragStart, onEditStart }) {
  const [editing, setEditing] = useState(!!obj.autoEdit)
  const drag = useRef(null)
  const taRef = useRef(null)

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus()
      taRef.current.select()
    }
  }, [editing])

  function onPointerDown(e) {
    if (editing) return
    e.stopPropagation()
    onSelect(obj.id)
    onDragStart?.()
    drag.current = { sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y, moved: false }
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
        cursor: editing ? 'text' : 'move',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onEditStart?.()
        setEditing(true)
      }}
    >
      {selected && !editing && (
        <button
          className="textbox-del"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(obj.id)
          }}
          title="Delete"
        >
          ×
        </button>
      )}

      {editing ? (
        <textarea
          ref={taRef}
          value={obj.text}
          onChange={(e) => onChange(obj.id, { text: e.target.value })}
          onBlur={() => setEditing(false)}
          style={{ fontSize: obj.fontSize, color: obj.color }}
        />
      ) : (
        <span>{obj.text || 'Double-click to edit'}</span>
      )}
    </div>
  )
}
