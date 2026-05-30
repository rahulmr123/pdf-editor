import TextBox from './TextBox.jsx'
import ImageBox from './ImageBox.jsx'
import TextPopup from './TextPopup.jsx'

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
  onGestureStart,
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

        {/* Image & signature objects */}
        {objects
          .filter((o) => o.type === 'image')
          .map((obj) => (
            <ImageBox
              key={obj.id}
              obj={obj}
              selected={obj.id === selectedId}
              onSelect={onSelect}
              onChange={onChange}
              onDelete={onDelete}
              onGestureStart={onGestureStart}
            />
          ))}

        {/* Text objects (display + drag; edited via the popup) */}
        {objects
          .filter((o) => o.type === 'text')
          .map((obj) => (
            <TextBox
              key={obj.id}
              obj={obj}
              selected={obj.id === selectedId}
              onSelect={onSelect}
              onChange={onChange}
              onDragStart={onDragStart}
            />
          ))}

        {/* Floating editor for the selected text object on this page */}
        {(() => {
          const sel = objects.find((o) => o.type === 'text' && o.id === selectedId)
          if (!sel) return null
          return (
            <TextPopup
              obj={sel}
              pageWidth={page.width}
              pageHeight={page.height}
              onChange={onChange}
              onDelete={onDelete}
              onEditStart={onEditStart}
            />
          )
        })()}
      </div>
      <div className="page-label">Page {page.pageIndex + 1}</div>
    </div>
  )
}
