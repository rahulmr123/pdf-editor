import { useEffect, useRef } from 'react'

const POPUP_W = 264
const POPUP_H = 120

// Floating editor for the selected text object: content + B/I + size + color.
export default function TextPopup({ obj, pageWidth, pageHeight, onChange, onDelete, onEditStart }) {
  const taRef = useRef(null)

  useEffect(() => {
    taRef.current?.focus()
  }, [obj.id])

  // place below the text; flip above if it would overflow the page bottom
  const below = obj.y + obj.fontSize * 1.4 + 8
  const wouldOverflow = below + POPUP_H > pageHeight
  const top = wouldOverflow ? Math.max(8, obj.y - POPUP_H - 8) : below
  const left = Math.max(8, Math.min(obj.x, pageWidth - POPUP_W - 8))

  return (
    <div
      className="text-popup"
      style={{ left, top, width: POPUP_W }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={taRef}
        value={obj.text}
        placeholder="Type text…"
        onFocus={onEditStart}
        onChange={(e) => onChange(obj.id, { text: e.target.value })}
      />
      <div className="tp-row">
        <button
          className={`tp-btn ${obj.bold ? 'on' : ''}`}
          style={{ fontWeight: 800 }}
          onClick={() => onChange(obj.id, { bold: !obj.bold })}
          title="Bold"
        >
          B
        </button>
        <button
          className={`tp-btn ${obj.italic ? 'on' : ''}`}
          style={{ fontStyle: 'italic' }}
          onClick={() => onChange(obj.id, { italic: !obj.italic })}
          title="Italic"
        >
          I
        </button>
        <span className="tp-sep" />
        <input
          className="tp-size"
          type="number"
          min="6"
          max="200"
          value={Math.round(obj.fontSize)}
          onChange={(e) => onChange(obj.id, { fontSize: Number(e.target.value) })}
          title="Font size"
        />
        <input
          className="tp-color"
          type="color"
          value={obj.color}
          onChange={(e) => onChange(obj.id, { color: e.target.value })}
          title="Color"
        />
        <span className="tp-sep" />
        <button className="tp-btn tp-del" onClick={() => onDelete(obj.id)} title="Delete">
          ✕
        </button>
      </div>
    </div>
  )
}
