import TextBox from './TextBox.jsx'

// One PDF page: the rendered raster as a locked background, a clickable text
// layer for editing existing text in place, and the editable object overlay.
export default function PageView({
  page,
  objects,
  selectedId,
  onSelect,
  onChange,
  onDelete,
  onAddText,
  onEditExisting,
  onDragStart,
  onEditStart,
}) {
  return (
    <div className="page-wrap">
      <div
        className="page"
        style={{ width: page.width, height: page.height }}
        onPointerDown={() => onSelect(null)}
        onDoubleClick={(e) => {
          // double-click empty space => drop a new text box there
          const rect = e.currentTarget.getBoundingClientRect()
          onAddText(page.pageIndex, e.clientX - rect.left, e.clientY - rect.top)
        }}
      >
        <img className="page-bg" src={page.dataUrl} draggable={false} alt="" />

        {/* Clickable existing-text layer (transparent hit targets) */}
        {page.textItems?.map((item, i) => (
          <span
            key={`t${i}`}
            className="text-hit"
            style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
            title="Click to edit this text"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onEditExisting(page.pageIndex, item)
            }}
          />
        ))}

        {/* Whiteout covers (rendered before text so text sits on top) */}
        {objects
          .filter((o) => o.type === 'whiteout')
          .map((o) => (
            <div
              key={o.id}
              className="whiteout"
              style={{ left: o.x, top: o.y, width: o.w, height: o.h, background: o.color }}
            />
          ))}

        {/* Editable text objects */}
        {objects
          .filter((o) => o.type === 'text')
          .map((obj) => (
            <TextBox
              key={obj.id}
              obj={obj}
              selected={obj.id === selectedId}
              onSelect={onSelect}
              onChange={onChange}
              onDelete={onDelete}
              onDragStart={onDragStart}
              onEditStart={onEditStart}
            />
          ))}
      </div>
      <div className="page-label">Page {page.pageIndex + 1}</div>
    </div>
  )
}
