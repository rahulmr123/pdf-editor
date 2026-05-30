// Top toolbar: add text, tweak the selected object, undo/redo, export, start over.
export default function Toolbar({
  selected,
  onAddText,
  onChange,
  onExport,
  onReset,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  busy,
}) {
  return (
    <div className="toolbar">
      <div className="brand">◷ pdfly <span>prototype</span></div>

      <div className="tools">
        <button className="btn" onClick={() => onAddText()}>+ Text</button>
        <button className="btn" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
        <button className="btn" onClick={onRedo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>
        <span className="hint">Tip: click any text on the page to edit it</span>

        {selected && (
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
