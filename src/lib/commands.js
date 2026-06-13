// The command / operations layer.
//
// Every change to the document is expressed as a *command* — a plain,
// serialisable descriptor like { type: 'addText', pageIndex, x, y } — and
// applied here by `applyCommand`. The toolbar, the ⌘K palette, and the future
// AI agent are all just callers that emit commands; none of them touch the
// objects array directly. That single chokepoint is also what powers undo/redo.
//
// `applyCommand(objects, cmd, ctx) -> { objects, selectId?, pending? }`
//   - objects : current overlay-object array (never mutated in place)
//   - cmd     : the command descriptor
//   - ctx     : { newId, pages } — id generator + rendered page metadata
//   - returns : the next objects array, an optional id to select, and optional
//               pending-edit bookkeeping for click-to-edit reverts.

// A blank text object with all the fields the rest of the app expects.
function makeText(id, pageIndex, x, y, overrides = {}) {
  return {
    id,
    type: 'text',
    pageIndex,
    x,
    y,
    text: 'New text',
    fontSize: 18,
    color: '#111111',
    bold: false,
    italic: false,
    bgColor: 'none',
    font: 'sans',
    fontRef: null,
    origFontRef: null,
    fontName: '',
    ...overrides,
  }
}

function whiteout(id, pageIndex, x, y, w, h, extra = {}) {
  return { id, type: 'whiteout', pageIndex, x, y, w, h, color: '#ffffff', ...extra }
}

// Cluster the contiguous run of original text on the clicked line. PDF.js often
// splits a phrase or table cell into several runs; we stop at large horizontal
// gaps so we don't bleed into the next column. Pure — drives click-to-edit.
export function clusterLine(textItems, item) {
  const line = (textItems || [])
    .filter((t) => Math.abs(t.y - item.y) < item.height * 0.6)
    .sort((a, b) => a.x - b.x)
  let cluster = [item]
  const idx = line.findIndex((t) => t.x === item.x && t.y === item.y && t.str === item.str)
  if (idx !== -1) {
    const gapMax = item.fontSize * 1.6
    let lo = idx
    let hi = idx
    while (lo > 0 && line[lo].x - (line[lo - 1].x + line[lo - 1].width) <= gapMax) lo--
    while (hi < line.length - 1 && line[hi + 1].x - (line[hi].x + line[hi].width) <= gapMax) hi++
    cluster = line.slice(lo, hi + 1)
  }
  return cluster
}

// Join a left-to-right run cluster into a string: a visible gap becomes a
// space, a tiny gap (a word split mid-glyph) stays joined.
function joinCluster(cluster) {
  let text = ''
  cluster.forEach((t, k) => {
    if (k > 0) {
      const prev = cluster[k - 1]
      if (t.x - (prev.x + prev.width) > t.fontSize * 0.28) text += ' '
    }
    text += t.str
  })
  return text
}

// The runs inside a drag-selected rectangle, grouped into lines (by y) and
// joined into one multi-line string. Pure — drives "Select text area".
export function groupRunsInRect(textItems, rect) {
  const items = (textItems || []).filter(
    (it) =>
      !(
        it.x > rect.x + rect.w ||
        it.x + it.width < rect.x ||
        it.y > rect.y + rect.h ||
        it.y + it.height < rect.y
      ),
  )
  if (!items.length) return { items: [], text: '' }
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(it.y - last.y) < it.height * 0.6) {
      last.items.push(it)
      last.y = Math.min(last.y, it.y)
    } else {
      lines.push({ y: it.y, items: [it] })
    }
  }
  const text = lines
    .map((l) =>
      l.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' '),
    )
    .join('\n')
  return { items, sorted, text }
}

export function applyCommand(objects, cmd, ctx) {
  const { newId, pages } = ctx
  switch (cmd.type) {
    // --- creation -------------------------------------------------------
    case 'addText': {
      const obj = makeText(newId(), cmd.pageIndex, cmd.x, cmd.y, cmd.fields)
      return { objects: [...objects, obj], selectId: obj.id }
    }

    case 'addImage': {
      const obj = {
        id: newId(),
        type: 'image',
        pageIndex: cmd.pageIndex,
        x: cmd.x,
        y: cmd.y,
        w: cmd.w,
        h: cmd.h,
        src: cmd.src,
      }
      return { objects: [...objects, obj], selectId: obj.id }
    }

    case 'addHighlight': {
      const obj = {
        id: newId(),
        type: 'highlight',
        pageIndex: cmd.pageIndex,
        x: cmd.x,
        y: cmd.y,
        w: cmd.w,
        h: cmd.h,
        color: cmd.color || '#FFE600',
        opacity: cmd.opacity ?? 0.4,
      }
      return { objects: [...objects, obj], selectId: obj.id }
    }

    // Generic add for objects the caller had to prepare with the DOM (decoded
    // images, cropped regions, measured doc-font runs).
    case 'addObjects':
      return { objects: [...objects, ...cmd.objects], selectId: cmd.selectId ?? null }

    // --- editing original PDF text -------------------------------------
    case 'editTextRun': {
      const page = pages.find((p) => p.pageIndex === cmd.pageIndex)
      const cluster = clusterLine(page?.textItems, cmd.item)
      const text = joinCluster(cluster)
      const pad = 1
      const whiteouts = cluster.map((t) =>
        whiteout(newId(), cmd.pageIndex, t.x - pad, t.y - pad, t.width + pad * 2, t.height + pad * 2),
      )
      const minX = Math.min(...cluster.map((t) => t.x))
      const minY = Math.min(...cluster.map((t) => t.y))
      const it = cmd.item
      const color = it.color || '#111111'
      const textObj = makeText(newId(), cmd.pageIndex, minX, minY, {
        text,
        fontSize: it.fontSize,
        bold: !!it.fontBold,
        italic: !!it.fontItalic,
        font: it.fontCategory || 'sans',
        fontRef: it.fontRef || null,
        origFontRef: it.fontRef || null,
        fontName: it.fontName || '',
        color,
      })
      return {
        objects: [...objects, ...whiteouts, textObj],
        selectId: textObj.id,
        pending: {
          textId: textObj.id,
          whiteoutIds: whiteouts.map((w) => w.id),
          originalText: text,
          originalFontSize: it.fontSize,
          originalBold: !!it.fontBold,
          originalItalic: !!it.fontItalic,
          originalFont: it.fontCategory || 'sans',
          originalColor: color,
        },
      }
    }

    case 'selectArea': {
      const page = pages.find((p) => p.pageIndex === cmd.pageIndex)
      const { items, sorted, text } = groupRunsInRect(page?.textItems, cmd.rect)
      if (!items.length) return { objects }
      const minX = Math.min(...items.map((i) => i.x))
      const minY = Math.min(...items.map((i) => i.y))
      const fontSize = sorted[0].fontSize
      const pad = 1
      // Cover each run individually (not one big box) so table gridlines survive.
      const whiteouts = items.map((it) =>
        whiteout(newId(), cmd.pageIndex, it.x - pad, it.y - pad, it.width + pad * 2, it.height + pad * 2),
      )
      const s0 = sorted[0]
      const color = s0.color || '#111111'
      const textObj = makeText(newId(), cmd.pageIndex, minX, minY, {
        text,
        fontSize,
        bold: !!s0.fontBold,
        italic: !!s0.fontItalic,
        font: s0.fontCategory || 'sans',
        fontRef: s0.fontRef || null,
        origFontRef: s0.fontRef || null,
        fontName: s0.fontName || '',
        color,
      })
      return {
        objects: [...objects, ...whiteouts, textObj],
        selectId: textObj.id,
        pending: {
          textId: textObj.id,
          whiteoutIds: whiteouts.map((w) => w.id),
          originalText: text,
          originalFontSize: fontSize,
          originalBold: !!s0.fontBold,
          originalItalic: !!s0.fontItalic,
          originalFont: s0.fontCategory || 'sans',
          originalColor: color,
        },
      }
    }

    // --- mutation -------------------------------------------------------
    case 'updateObject':
      return {
        objects: objects.map((o) => (o.id === cmd.id ? { ...o, ...cmd.patch } : o)),
      }

    case 'deleteObjects': {
      const ids = new Set(cmd.ids)
      return { objects: objects.filter((o) => !ids.has(o.id)), selectId: null }
    }

    // "Redaction" today = a baked white cover over the region (true content-
    // stream removal is a later command; callers stay the same).
    case 'redactRegion': {
      const r = cmd.region
      return {
        objects: [...objects, whiteout(newId(), r.pageIndex, r.x, r.y, r.width, r.height)],
        selectId: null,
      }
    }

    // --- whole-document font restyle -----------------------------------
    case 'replaceDocRestyle':
      return {
        objects: [...objects.filter((o) => !o.docRestyle), ...cmd.objects],
        selectId: null,
      }

    case 'clearDocRestyle':
      return { objects: objects.filter((o) => !o.docRestyle), selectId: null }

    default:
      return { objects }
  }
}
