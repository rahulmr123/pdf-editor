import { useRef } from 'react'
import { DOC_FONTS } from '../lib/docfonts.js'

// Top toolbar: grouped into Insert / Modes / History on the left, and
// view + file actions on the right. A slim contextual bar appears below
// only when a special mode (Select text / Show images) is active.
export default function Toolbar({
  onAddText,
  onImageFile,
  onAddSignature,
  onAddHighlight,
  selectMode,
  onToggleSelectMode,
  cutMode,
  onToggleCutMode,
  redactMode,
  onToggleRedactMode,
  imageMode,
  onToggleImageMode,
  viewTheme,
  onViewTheme,
  docFont,
  onApplyDocFont,
  onExport,
  onReset,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  showPages,
  onTogglePages,
  busy,
}) {
  const fileRef = useRef(null)

  return (
    <>
      <div className="toolbar">
        <div className="brand">◷ pdfly</div>

        <div className="tool-group">
          <button className="tbtn" onClick={() => onAddText()}>Text</button>
          <button className="tbtn" onClick={() => fileRef.current?.click()}>Image</button>
          <button className="tbtn" onClick={onAddSignature}>Sign</button>
          <button className="tbtn" onClick={onAddHighlight}>Highlight</button>
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
        </div>

        <div className="tool-group">
          <button
            className={`tbtn ${selectMode ? 'active' : ''}`}
            onClick={onToggleSelectMode}
            title="Drag a box around multiple lines (e.g. an address) to edit them as one block"
          >
            Select
          </button>
          <button
            className={`tbtn ${cutMode ? 'active' : ''}`}
            onClick={onToggleCutMode}
            title="Drag a box around a signature, seal or stamp to lift it into a movable object"
          >
            ✂ Cut out
          </button>
          <button
            className={`tbtn ${redactMode ? 'active' : ''}`}
            onClick={onToggleRedactMode}
            title="Drag a box over text or images to permanently remove the content on export"
          >
            ▮ Redact
          </button>
          <button
            className={`tbtn ${imageMode ? 'active' : ''}`}
            onClick={onToggleImageMode}
            title="Highlight all images on the page"
          >
            Show images
          </button>
        </div>

        <div className="tool-group">
          <button className="tbtn icon" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
          <button className="tbtn icon" onClick={onRedo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>
        </div>

        <div className="tool-group">
          <button
            className={`tbtn ${showPages ? 'active' : ''}`}
            onClick={onTogglePages}
            title="Show the Pages panel to reorder or delete pages"
          >
            ▤ Pages
          </button>
        </div>

        <div className="right">
          <span className="ctl-label">Font</span>
          <select
            className="theme-select"
            value={docFont}
            onChange={(e) => onApplyDocFont(e.target.value)}
            title="Restyle the entire document in this font"
          >
            <option value="">Original</option>
            {Object.entries(DOC_FONTS).map(([k, f]) => (
              <option key={k} value={k}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="ctl-label">View</span>
          <select
            className="theme-select"
            value={viewTheme}
            onChange={(e) => onViewTheme(e.target.value)}
            title="Reading theme (changes how pages look on screen)"
          >
            <option value="normal">Normal</option>
            <option value="dark">Dark</option>
            <option value="sepia">Sepia</option>
            <option value="contrast">High contrast</option>
          </select>
          <button className="btn ghost" onClick={onReset}>New file</button>
          <button className="btn primary" onClick={onExport} disabled={busy}>
            {busy ? 'Exporting…' : '⬇ Export'}
          </button>
        </div>
      </div>

      {(selectMode || cutMode || redactMode || imageMode) && (
        <div className="mode-bar">
          {selectMode
            ? '✦ Select mode — drag a box around the lines you want (e.g. an address) to edit them together'
            : cutMode
              ? '✂ Cut-out mode — drag a box around a signature, seal or stamp to lift it into a movable object'
              : redactMode
                ? '▮ Redact mode — drag a box over text or images; the content beneath is permanently removed on export'
                : '✦ Showing all images — click one to remove or replace it'}
        </div>
      )}
    </>
  )
}
