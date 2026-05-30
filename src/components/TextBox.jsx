import { useRef } from 'react'

const CORNERS = ['tl', 'tr', 'bl', 'br']
const FAMILIES = {
  serif: 'Georgia, "Times New Roman", Times, serif',
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: '"Courier New", Courier, monospace',
}

// Display + drag + corner-resize (scales font size). Text is edited in TextPopup.
export default function TextBox({ obj, selected, onSelect, onChange, onDragStart }) {
  const boxRef = useRef(null)
  const gesture = useRef(null)

  function startDrag(e) {
    e.stopPropagation()
    onSelect(obj.id)
    onDragStart?.()
    gesture.current = { mode: 'move', sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function startResize(e, corner) {
    e.stopPropagation()
    onSelect(obj.id)
    onDragStart?.()
    const rect = boxRef.current.getBoundingClientRect()
    gesture.current = {
      mode: 'resize', corner,
      sx: e.clientX, sy: e.clientY,
      ox: obj.x, oy: obj.y,
      sw: rect.width, sh: rect.height, sf: obj.fontSize,
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

    // resize scales the font, driven by whichever axis you drag more;
    // the opposite corner stays anchored
    const right = g.corner.includes('r')
    const bottom = g.corner.includes('b')
    const aW = right ? dx : -dx
    const aH = bottom ? dy : -dy
    const delta = Math.abs(aW) > Math.abs(aH) ? aW / g.sw : aH / g.sh
    const newFont = Math.min(400, Math.max(6, g.sf * Math.max(0.05, 1 + delta)))
    const scale = newFont / g.sf
    onChange(obj.id, {
      fontSize: newFont,
      x: Math.max(0, right ? g.ox : g.ox + g.sw * (1 - scale)),
      y: Math.max(0, bottom ? g.oy : g.oy + g.sh * (1 - scale)),
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
      ref={boxRef}
      className={`textbox ${selected ? 'selected' : ''}`}
      style={{
        left: obj.x,
        top: obj.y,
        fontSize: obj.fontSize,
        color: obj.color,
        fontFamily: [
          obj.fontRef ? `"${obj.fontRef}"` : '',
          obj.fontName || '',
          FAMILIES[obj.font] || FAMILIES.sans,
        ]
          .filter(Boolean)
          .join(', '),
        // embedded fonts already encode weight/style; only synthesize for fallbacks
        fontWeight: obj.fontRef ? 'normal' : obj.bold ? 700 : 400,
        fontStyle: obj.fontRef ? 'normal' : obj.italic ? 'italic' : 'normal',
        background: obj.bgColor && obj.bgColor !== 'none' ? obj.bgColor : 'transparent',
      }}
      onPointerDown={startDrag}
      onPointerMove={onMove}
      onPointerUp={endGesture}
    >
      <span>{obj.text || ' '}</span>

      {selected &&
        CORNERS.map((c) => (
          <span
            key={c}
            className={`handle ${c}`}
            onPointerDown={(e) => startResize(e, c)}
            onPointerMove={onMove}
            onPointerUp={endGesture}
          />
        ))}
    </div>
  )
}
