import TextBox from './TextBox.jsx'

// One PDF page: the rendered raster as a locked background, plus the overlay
// layer that holds all editable objects for this page.
export default function PageView({
  page,
  objects,
  selectedId,
  onSelect,
  onChange,
  onDelete,
  onAddText,
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
        {objects.map((obj) => (
          <TextBox
            key={obj.id}
            obj={obj}
            selected={obj.id === selectedId}
            onSelect={onSelect}
            onChange={onChange}
            onDelete={onDelete}
          />
        ))}
      </div>
      <div className="page-label">Page {page.pageIndex + 1}</div>
    </div>
  )
}
