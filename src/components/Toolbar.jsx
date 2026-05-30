import { useRef } from 'react'

// Top toolbar: add text/image/signature, tweak selection, undo/redo, export.
export default function Toolbar({
  selected,
  onAddText,
  onImageFile,
  onAddSignature,
  onAddHighlight,
  selectMode,
  onToggleSelectMode,
  imageMode,
  onToggleImageMode,
  viewTheme,
  onViewTheme,
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
        <button className="btn" onClick={onAddHighlight}>🖍 Highlight</button>
        <button
          className={`btn ${selectMode ? 'active' : ''}`}
          onClick={onToggleSelectMode}
          title="Drag a box around multiple lines (e.g. an address) to edit them as one block"
        >
          ▦ Select text
        </button>
        <button
          className={`btn ${imageMode ? 'active' : ''}`}
          onClick={onToggleImageMode}
          title="Highlight all images on the page"
        >
          🖼 Images
        </button>
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
        <span className="hint">
          {selectMode
            ? 'Drag a box around the lines you want (e.g. an address) to edit them together'
            : imageMode
              ? 'All images highlighted — click one to remove or replace'
              : 'Tip: click any text or image on the page to edit it'}
        </span>
      </div>

      <div className="actions">
        <select
          className="theme-select"
          value={viewTheme}
          onChange={(e) => onViewTheme(e.target.value)}
          title="Reading theme (changes how pages look on screen)"
        >
          <option value="normal">◐ View: Normal</option>
          <option value="dark">🌙 View: Dark</option>
          <option value="sepia">📜 View: Sepia</option>
          <option value="contrast">◼ View: High contrast</option>
        </select>
        <button className="btn ghost" onClick={onReset}>New file</button>
        <button className="btn primary" onClick={onExport} disabled={busy}>
          {busy ? 'Exporting…' : '⬇ Export PDF'}
        </button>
      </div>
    </div>
  )
}
