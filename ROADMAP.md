# Product Roadmap — PDF Editor

> **Vision:** The smoothest, privacy-first way to edit any PDF — right in your
> browser, for free. Your files never leave your device.

> **Wedge (what we win first):** Be *10x smoother* than Smallpdf / iLovePDF /
> Adobe at the everyday job: **fill, sign, edit, annotate a PDF**. Don't chase
> "do everything" until we own that one workflow.

---

## North-star & guardrails

- **North-star metric:** weekly *successful edits* (a user who uploads **and**
  exports an edited PDF). This is the moment we delivered value.
- **Positioning:** privacy (100% client-side) + UX polish. Neither is copyable
  overnight by incumbents who upload your files.
- **Non-goals (for now):** lossy "PDF → Word → PDF" conversion, heavy
  server-side processing, enterprise/SSO, mobile native apps.

---

## Target user (ICP)

| | Who | Pain today |
|---|---|---|
| **Primary** | Freelancers, small-business owners, students | Adobe is expensive/clunky; free tools upload your files and feel clumsy |
| **Secondary** | Anyone with sensitive docs (legal, HR, finance) | Won't upload confidential PDFs to a random web tool |

---

## Phases — Now / Next / Later

### ✅ Phase 0 — Proof of concept *(DONE)*
Upload → render → drop/drag/edit text overlay → export baked PDF, fully client-side.
**The core technical risk is retired.**

---

### 🔨 Phase 1 — "Real editor feel" (MVP we'd launch)
*Goal: a user can fully fill, sign, and tweak a PDF and it feels delightful.*

**Must-have (MoSCoW: Must)**
- [ ] **Edit existing text in place** — click PDF text → white-out + matched editable box (PDF.js text positions). *The differentiator.*
- [ ] **Resize handles + snapping** on objects; keyboard nudge & delete
- [ ] **Undo / redo**
- [ ] **Signatures** — draw, type, or upload; reusable
- [ ] **Images** — drop/upload, move, resize
- [ ] **Whiteout / highlight** boxes

**Should-have**
- [ ] Page thumbnails + quick navigation
- [ ] Multi-select & alignment
- [ ] Autosave to local storage (don't lose work on refresh)

**Could-have**
- [ ] Basic shapes (rect, line, checkmark)

**Success criteria:** 100 real users complete an edit+export; qualitative "this is smoother than X."

---

### 🔜 Phase 2 — Document toolkit (meet "PDF tool" expectations)
*Goal: people stop reaching for other tools for common page jobs.*

- [x] Page ops: **reorder, delete, insert blank** ✅ — *(rotate, merge, split still to do)*
- [x] **True redaction** (remove underlying content, not just cover it) — trust feature ✅
      *Redacted pages are flattened to a raster with the area blacked out, so the*
      *original text/images are physically gone — verified unextractable. Tradeoff:*
      *a redacted page loses its selectable text layer.*
- [ ] **Form-field detection & fill** (AcroForms)
- [ ] Compress PDF
- [ ] Image ↔ PDF, PDF → image (all client-side)

**Success criteria:** organic sharing / word-of-mouth; return visits.

---

### 🌤️ Phase 3 — Accounts & monetization
*Goal: turn usage into revenue without breaking the free, private core.*

- [ ] Auth + **cloud save / version history** (opt-in; local stays default)
- [ ] **Pro tier** (the money):
  - [ ] **E-signature with audit trail / certificate** ← primary revenue driver
  - [ ] OCR for scanned PDFs
  - [ ] Batch processing, large files
  - [ ] No watermark on exports
- [ ] Light server only where unavoidable (OCR, audit trail, conversions)

**Model:** Free = full client-side editor. Pro = subscription for the above.
**Success criteria:** first paying users; >2% free→Pro conversion.

---

### 🔭 Phase 4 — Differentiation & growth
- [ ] **AI-native:** edit by instruction, extract tables → clean Excel, auto-redact PII, summarize
- [ ] Templates & shareable links / light collaboration
- [ ] Public API / integrations (Drive, Dropbox)

---

## Immediate next sprint (recommended)

1. **Edit existing text in place** (the wow moment)
2. **Resize handles + undo/redo** (makes everything feel pro)
3. **Signatures** (unlocks the #1 real use case: signing)

> Rationale: these three convert the prototype from "markup tool" into
> "the PDF editor I tell friends about." Everything else can wait for feedback.

---

## How we prioritize

- **Now/Next/Later**, re-evaluated after every batch of real user feedback.
- A feature earns "Now" only if it serves the **wedge** (fill/sign/edit smoothness)
  or removes a **trust blocker** (e.g. real redaction).
- Ship small, watch the north-star metric, let users pull the roadmap forward.
