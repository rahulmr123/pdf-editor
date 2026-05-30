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
  onEditExisting,
  onDragStart,
  onEditStart,
  onGestureStart,
  imageMode,
  selectedRegion,
  onSelectRegion,
  onRemoveRegion,
  onReplaceRegion,
}) {
  const regionOnThisPage =
    imageMode && selectedRegion && selectedRegion.pageIndex === page.pageIndex
      ? selectedRegion
      : null
  return (
    <div className="page-wrap">
      <div
        className="page"
        style={{ width: page.width, height: page.height }}
        onPointerDown={() => {
          onSelect(null)
          if (imageMode) onSelectRegion(null)
        }}
      >
        <img className="page-bg" src={page.dataUrl} draggable={false} alt="" />

        {/* Image-edit mode: detected image regions you can remove/replace */}
        {imageMode &&
          page.imageRegions?.map((rg, i) => {
            const on = selectedRegion?.pageIndex === page.pageIndex && selectedRegion.index === i
            return (
              <div
                key={`img${i}`}
                className={`img-region ${on ? 'on' : ''}`}
                style={{ left: rg.x, top: rg.y, width: rg.width, height: rg.height }}
                title="Click to remove or replace this image"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectRegion({ pageIndex: page.pageIndex, index: i, ...rg })
                }}
              />
            )
          })}

        {regionOnThisPage && (
          <div
            className="region-popup"
            style={{
              left: Math.max(8, Math.min(regionOnThisPage.x, page.width - 196)),
              top: Math.min(regionOnThisPage.y + regionOnThisPage.height + 6, page.height - 48),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button className="rp-btn" onClick={() => onReplaceRegion(regionOnThisPage)}>
              ↺ Replace
            </button>
            <button className="rp-btn danger" onClick={() => onRemoveRegion(regionOnThisPage)}>
              ✕ Remove
            </button>
          </div>
        )}

        {/* Clickable existing-text layer (transparent hit targets) */}
        {!imageMode &&
          page.textItems?.map((item, i) => (
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
