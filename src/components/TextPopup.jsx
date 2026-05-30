import { useEffect, useRef } from 'react'

const POPUP_W = 264
const POPUP_H = 202

const hasFill = (o) => o.bgColor && o.bgColor !== 'none'

// Floating editor for the selected text object: content + B/I + size + colors.
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
        <span className="tp-sep" />
        <button className="tp-btn tp-del" onClick={() => onDelete(obj.id)} title="Delete">
          ✕
        </button>
      </div>

      <div className="tp-row">
        <span className="tp-label">Font</span>
        <select
          className="tp-font"
          value={obj.fontRef ? 'original' : obj.font || 'sans'}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'original') onChange(obj.id, { fontRef: obj.origFontRef })
            else onChange(obj.id, { font: v, fontRef: null })
          }}
          title="Font for this text"
        >
          {obj.origFontRef && <option value="original">Original (document font)</option>}
          <option value="sans">Sans-serif (Helvetica)</option>
          <option value="serif">Serif (Times)</option>
          <option value="mono">Monospace (Courier)</option>
        </select>
      </div>

      <div className="tp-row tp-colors">
        <span className="tp-label">Text</span>
        <input
          className="tp-color"
          type="color"
          value={obj.color}
          onChange={(e) => onChange(obj.id, { color: e.target.value })}
          title="Text color"
        />
        <span className="tp-label">Fill</span>
        <input
          className="tp-color"
          type="color"
          value={hasFill(obj) ? obj.bgColor : '#ffe600'}
          onChange={(e) => onChange(obj.id, { bgColor: e.target.value })}
          title="Background fill"
        />
        <button
          className={`tp-btn tp-nofill ${hasFill(obj) ? '' : 'on'}`}
          onClick={() => onChange(obj.id, { bgColor: 'none' })}
          title="No fill"
        >
          ⌀
        </button>
      </div>
    </div>
  )
}
