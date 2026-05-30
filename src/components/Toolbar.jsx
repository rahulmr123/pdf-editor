import { useRef } from 'react'

// Top toolbar: add text/image/signature, tweak selection, undo/redo, export.
export default function Toolbar({
  selected,
  onAddText,
  onImageFile,
  onAddSignature,
  onChange,
  onExport,
  onReset,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  busy,
}) {
  const fileRef = useRef(null)

  return (
    <div className="toolbar">
      <div className="brand">◷ pdfly <span>prototype</span></div>

      <div className="tools">
        <button className="btn" onClick={() => onAddText()}>+ Text</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>+ Image</button>
        <button className="btn" onClick={onAddSignature}>✎ Sign</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImageFile(f)
            e.target.value = ''
          }}
        />
        <span className="sep-v" />
        <button className="btn" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
        <button className="btn" onClick={onRedo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>

        {selected?.type === 'text' && (
          <div className="inspector">
            <label>
              Size
              <input
                type="number"
                min="6"
                max="200"
                value={Math.round(selected.fontSize)}
                onChange={(e) => onChange(selected.id, { fontSize: Number(e.target.value) })}
              />
            </label>
            <label>
              Color
              <input
                type="color"
                value={selected.color}
                onChange={(e) => onChange(selected.id, { color: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>

      <div className="actions">
        <button className="btn ghost" onClick={onReset}>New file</button>
        <button className="btn primary" onClick={onExport} disabled={busy}>
          {busy ? 'Exporting…' : '⬇ Export PDF'}
        </button>
      </div>
    </div>
  )
}
