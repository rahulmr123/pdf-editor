import { useRef, useState } from 'react'
import TextBox from './TextBox.jsx'
import ImageBox from './ImageBox.jsx'
import HighlightBox from './HighlightBox.jsx'
import TextPopup from './TextPopup.jsx'

// One PDF page: the rendered raster as a locked background, a clickable text
// layer for editing existing text in place, and the editable object overlay.
export default function PageView({
  page,
  pageNumber,
  isActive,
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
  onLiftRegion,
  onReplaceImage,
  selectMode,
  onAreaSelect,
  cutMode,
  onCutOut,
  onActivate,
}) {
  const marqueeMode = selectMode || cutMode
  const regionOnThisPage =
    selectedRegion && selectedRegion.pageIndex === page.pageIndex ? selectedRegion : null

  const [marquee, setMarquee] = useState(null)
  const start = useRef(null)

  // a text run is "consumed" once a whiteout covers it (edited/replaced/grabbed)
  const whiteouts = objects.filter((o) => o.type === 'whiteout')
  const isCovered = (it) => {
    const cx = it.x + it.width / 2
    const cy = it.y + it.height / 2
    return whiteouts.some((w) => cx >= w.x && cx <= w.x + w.w && cy >= w.y && cy <= w.y + w.h)
  }

  function onPageDown(e) {
    onActivate?.(page.pageIndex)
    onSelect(null)
    onSelectRegion(null)
    if (!marqueeMode) return
    const r = e.currentTarget.getBoundingClientRect()
    start.current = { el: e.currentTarget, x: e.clientX - r.left, y: e.clientY - r.top }
    setMarquee({ x: start.current.x, y: start.current.y, w: 0, h: 0 })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onPageMove(e) {
    if (!marqueeMode || !start.current) return
    const r = start.current.el.getBoundingClientRect()
    const cx = e.clientX - r.left
    const cy = e.clientY - r.top
    const s = start.current
    setMarquee({ x: Math.min(s.x, cx), y: Math.min(s.y, cy), w: Math.abs(cx - s.x), h: Math.abs(cy - s.y) })
  }
  function onPageUp() {
    if (!marqueeMode || !start.current) return
    const m = marquee
    start.current = null
    setMarquee(null)
    if (m && m.w > 6 && m.h > 6) {
      if (selectMode) onAreaSelect(page.pageIndex, m)
      else if (cutMode) onCutOut(page.pageIndex, m)
    }
  }
  return (
    <div className="page-wrap" id={`pw-${page.pageIndex}`}>
      <div
        className={`page ${marqueeMode ? 'select-mode' : ''}`}
        style={{ width: page.width, height: page.height }}
        onPointerDown={onPageDown}
        onPointerMove={onPageMove}
        onPointerUp={onPageUp}
      >
        <img className="page-bg" src={page.dataUrl} draggable={false} alt="" />

        {marquee && (
          <div
            className="marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}

        {/* Detected images: click to remove/replace (always clickable, like text).
            'show-all' outlines every image when the Images toggle is on. */}
        {!marqueeMode &&
          page.imageRegions?.map((rg, i) => {
          if (isCovered(rg)) return null
          const on = selectedRegion?.pageIndex === page.pageIndex && selectedRegion.index === i
          return (
            <div
              key={`img${i}`}
              className={`img-region ${imageMode ? 'show-all' : ''} ${on ? 'on' : ''}`}
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
              left: Math.max(8, Math.min(regionOnThisPage.x, page.width - 290)),
              top: Math.min(regionOnThisPage.y + regionOnThisPage.height + 6, page.height - 48),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button className="rp-btn" onClick={() => onLiftRegion(regionOnThisPage)}>
              ⤢ Resize
            </button>
            <button className="rp-btn" onClick={() => onReplaceRegion(regionOnThisPage)}>
              ↺ Replace
            </button>
            <button className="rp-btn danger" onClick={() => onRemoveRegion(regionOnThisPage)}>
              ✕ Remove
            </button>
          </div>
        )}

        {/* Clickable existing-text layer (rendered after images so text wins overlap).
            Skip runs already covered by a whiteout so old text can't be re-grabbed. */}
        {!marqueeMode &&
          page.textItems?.map((item, i) =>
            isCovered(item) ? null : (
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
            ),
          )}

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

        {/* Replace / Remove popup for the selected image (detected or lifted) */}
        {(() => {
          const selImg = objects.find((o) => o.type === 'image' && o.id === selectedId)
          if (!selImg) return null
          return (
            <div
              className="region-popup"
              style={{
                left: Math.max(8, Math.min(selImg.x, page.width - 200)),
                top: Math.max(8, selImg.y - 44),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button className="rp-btn" onClick={() => onReplaceImage(selImg.id)}>↺ Replace</button>
              <button className="rp-btn danger" onClick={() => onDelete(selImg.id)}>✕ Remove</button>
            </div>
          )
        })()}

        {/* Highlight rectangles (under text/images) */}
        {objects
          .filter((o) => o.type === 'highlight')
          .map((obj) => (
            <HighlightBox
              key={obj.id}
              obj={obj}
              selected={obj.id === selectedId}
              onSelect={onSelect}
              onChange={onChange}
              onDelete={onDelete}
              onGestureStart={onGestureStart}
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
      <div className={`page-label ${isActive ? 'active' : ''}`}>
        Page {pageNumber ?? page.pageIndex + 1}
        {isActive && <span className="page-label-tag">· adding here</span>}
      </div>
    </div>
  )
}
