import { useState } from 'react'

// Left sidebar of page thumbnails. Drag a thumbnail to reorder, click to jump
// to that page, or use the ✕ to drop a page from the document. Order and
// deletions are reflected on the canvas and in the exported PDF.
export default function PagesPanel({
  pageOrder,
  pageById,
  activePage,
  onGoToPage,
  onMovePage,
  onDeletePage,
}) {
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  function onDrop(to) {
    if (dragFrom != null && dragFrom !== to) onMovePage(dragFrom, to)
    setDragFrom(null)
    setDragOver(null)
  }

  return (
    <aside className="pages-panel">
      <div className="pages-panel-head">Pages</div>
      <div className="pages-list">
        {pageOrder.map((srcIndex, pos) => {
          const page = pageById.get(srcIndex)
          if (!page) return null
          const active = srcIndex === activePage
          return (
            <div
              key={srcIndex}
              className={`thumb ${active ? 'active' : ''} ${dragOver === pos ? 'drag-over' : ''}`}
              draggable
              onDragStart={() => setDragFrom(pos)}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragOver !== pos) setDragOver(pos)
              }}
              onDrop={() => onDrop(pos)}
              onDragEnd={() => {
                setDragFrom(null)
                setDragOver(null)
              }}
              onClick={() => onGoToPage(srcIndex)}
              title={`Page ${pos + 1} — drag to reorder`}
            >
              <div className="thumb-img-wrap">
                <img className="thumb-img" src={page.dataUrl} alt={`Page ${pos + 1}`} draggable={false} />
                {pageOrder.length > 1 && (
                  <button
                    className="thumb-del"
                    title="Delete this page"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeletePage(srcIndex)
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="thumb-num">{pos + 1}</div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
