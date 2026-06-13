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

## Distribution — how users find us

> **The hard truth:** a 10x-smoother editor nobody discovers loses to a clunky
> one that ranks #1. Smallpdf / iLovePDF / Adobe own the SEO for every
> "pdf [verb]" query. We need an **acquisition wedge as sharp as our
> product wedge** — this is a bigger near-term risk than any missing feature.

**Acquisition wedge:** win the *privacy-intent* searcher first —
"edit pdf without uploading", "sign pdf offline", "private / local pdf editor".
Lower competition, and the searcher is already pre-sold on our one true
differentiator.

### Channels (ranked by leverage)
1. **Programmatic SEO** — one fast, genuinely useful landing page per
   job-to-be-done ("Fill a PDF form", "Sign a PDF", "Edit text in a PDF",
   "Redact a PDF"). Each page *is* the tool, usable above the fold; privacy is
   the hook in the title/description.
2. **The product is the funnel** — no signup to edit + export, time-to-value in
   seconds. Every successful export is a potential share moment.
3. **Subtle attribution** on the share path (not a watermark on the file) — a
   "made privately with pdfly" link we control; opt-out for Pro.
4. **Trust / comparison content** — "is it safe to edit PDFs online?",
   "X vs pdfly" — rides incumbent brand searches with the privacy angle.
5. **Communities** — r/freelance, r/smallbusiness, legal/HR forums,
   IndieHackers. Lead with privacy, not feature lists.
6. **Integrations (later)** — Drive / Dropbox "Open with", embeddable widget.

### Funnel & instrumentation
- Land → **edit** → **export** → (return / share). The north-star lives at
  *export*.
- **Privacy-safe analytics only:** anonymous client-side events (file opened,
  object added, exported) — **never** file names or contents. Measuring the
  north-star must not break the positioning.

**Success criteria:** at least one repeatable, ~$0-CAC organic channel producing
a predictable weekly flow of first-time successful edits.

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

- [x] Page ops: **reorder, delete, insert blank, rotate** ✅ — *(merge, split still to do)*
      *Rotating a page bakes the rotation into a raster on export (its text layer*
      *is flattened), like redaction — lossless rotation is a follow-up.*
- [x] **True redaction** (remove underlying content, not just cover it) — trust feature ✅
      *Redacted pages are flattened to a raster with the area blacked out, so the*
      *original text/images are physically gone — verified unextractable. Tradeoff:*
      *a redacted page loses its selectable text layer.*
- [x] **Form-field detection & fill** (AcroForms) ✅ — *text, checkbox, radio &*
      *dropdown fields; filled values are flattened into the page on export*
- [ ] Compress PDF
- [ ] Image ↔ PDF, PDF → image (all client-side)

**Success criteria:** organic sharing / word-of-mouth; return visits.

---

### 🌤️ Phase 3 — Accounts & monetization
*Goal: turn usage into revenue without **taxing** the free, private core.*

> **Principle:** the free editor stays *fully usable* and **un-watermarked** —
> that IS the wedge and the trust story. We charge for things that genuinely
> need a server or serve a different, higher-WTP buyer — never by crippling free.

- [ ] Auth + **cloud save / version history** (opt-in; local stays default)
- [ ] **Pro tier** (the money), aimed at the *business / legal / HR* buyer:
  - [ ] **E-signature with audit trail / certificate** ← primary revenue driver
        (the one feature that legitimately needs a server)
  - [ ] **Request signatures** from others + status tracking
  - [ ] Team workspace, shared templates, branding
  - [ ] Batch processing, very large files, priority
- [ ] Light server only where unavoidable (audit trail, signature requests)

> **Corrections to earlier thinking:** OCR already ships **free** and
> client-side (a trust/UX feature, not a paywall), and we do **not** watermark
> free exports — both would fight the wedge.

**Two ICPs, one product:**
- *Free ICP* — freelancers, students, anyone with a sensitive doc. Won on
  smoothness + privacy. May never pay; they're our **distribution**.
- *Paying ICP* — businesses / legal / HR who need **signatures with an audit
  trail**. A different segment with real budget.

**Pricing model:** PDF editing is often *episodic* (sign a lease, done for
months), so a pure monthly sub may mismatch usage. Test a **Pro subscription**
(signatures / teams) *alongside* **pay-per-signed-document / credits** for
occasional users, and see which the paying ICP prefers.

**Success criteria:** first paying users; a repeatable channel→revenue path;
>2% of *active* users reach a Pro-gated action.

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
