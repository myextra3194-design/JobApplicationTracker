# PLAN.md — reconciliation log

The spec is [`job-application-tracker-build-plan.md`](job-application-tracker-build-plan.md).
Do not duplicate it here. This file records what we locked, what we renamed, and
where we deliberately deviate. If a later part disagrees with this file, the spec
wins except for the locked decisions below.

---

## Locked decisions

- Spec source: `job-application-tracker-build-plan.md`, verbatim. Parts 2–12 are
  implemented from that file's own `### Part N` sections, not from a reconstruction.
- Stack: React + Vite + Tailwind, records in localStorage, files in IndexedDB.
  No backend, no login, no component library, no state library.
- Persistence sits behind `RecordStore` + `AttachmentStore`. UI never touches
  `localStorage` or `indexedDB` directly; it calls `getStorage()`. A REST + SQLite
  adapter can replace the local pair later without rewriting components.
- Cadence: one part at a time. Stop for review in the live preview after each.
- Status pipeline is the plan's seven stages:
  `Saved → Applied → Shortlisted → Interview → Offer → Rejected → Withdrawn`.
  `status` is a closed set (a wrong stage = a card in no column).
- `interviewStatus` and `finalResult` are free text with suggestion lists, as the
  plan types them ("e.g."). Defaults when empty: `Not scheduled` and `Pending`.
- Single `followUpDate`. `.ics` export is per-event, from a button beside each
  date (Part 7), not a bulk dump.
- `matchScore` and `cvVersionUsed` stay as optional extras so this tracker can
  round-trip scores/CVs from the job-search-agent Score Job / Generate CV pages.
- `deletedAt: string | null` is kept as the undo window between Part 2 "Delete"
  and Part 9 "Delete permanently". Archive (`isArchived`) is never that.
  Documented extra, not a rename of `isArchived`.
- Files cascade from IndexedDB only on permanent delete, via
  `attachments.removeAllFor(applicationId)`. There is no `attachmentIds` field
  on the record; Part 5 keys files by application id.
- Deployment: GitHub Pages, **"Deploy from a branch" → `<branch>` → `/docs`**.
  Pages' branch source only offers `/` or `/docs` (never `/dist`), so `docs/` is a
  committed byte-identical mirror of the built `dist/`, and every commit that
  changes `dist/` must copy the new build to `docs/` in the same commit
  (`cp -a dist/. docs/`). `dist/` stays as the Vite build output and is committed
  next to its source (exception to the repo's `dist/` ignore, applied with
  `git add -f`), because the sandbox's GitHub App has no `workflows` permission
  and therefore cannot push a CI deploy workflow. `.github/workflows/deploy.yml`
  exists in the sandbox tree as the future auto-deploy upgrade: paste it in via
  the web UI and switch Pages to "GitHub Actions" when you want `dist/` out of
  git. Vite uses a relative `base: './'` so the same build works at any mount
  path. PWA = hand-written `public/manifest.webmanifest` + icons + app-shell
  `public/sw.js`; no plugin, no new dependency. The service worker is registered
  from `src/main.tsx` in production builds only and caches HTTP responses only —
  it is not part of the data seam and never touches `localStorage`/IndexedDB.
- Data is per browser install: phone ≠ desktop ≠ iPhone-home-screen-app. Sync is out
  of scope until Part 11's export/import; nobody should plan on cross-device
  continuity.
- Repo state check (2026-08-29): this checkout contains **Parts 1–4**. Part 3 was
  rebuilt to spec after the old board branch was found never merged: List/Board
  toggle at the top of the page, the seven columns in pipeline order, non-archived
  only, and status change via a dropdown on the card (no drag-and-drop) — same
  store as the list. Part 4's search/filters/sort live in `src/lib/query.ts` as
  `filterToQuery` / `DEFAULT_FILTERS` / `hasActiveFilters` on top of `applyQuery`,
  which gained the multi-tag `tags`, the `jobPortal` filter and the `interviewDate`
  sort key (extended, not duplicated). One toolbar drives both views: the list
  hides non-matching rows, the board dims them and does not sort.

---

## Field-name table (plan names are the contract)

An earlier Part 1 (truncated plan) shipped the wrong names. This is the mapping
that Task 0 applied. Any future rename gets a new line here.

| Plan name (contract) | Wrong name that shipped | Notes |
| --- | --- | --- |
| `JobApplication` | `ApplicationRecord` | the record type |
| `NewJobApplication` | `NewApplication` | create/import input |
| `JobApplicationPatch` | `ApplicationPatch` | update input; identity forbidden |
| `emptyJobApplication` | `emptyApplication` | |
| `normalizeJobApplication` | `normalizeApplication` | |
| `normalizeJobApplicationList` | `normalizeApplicationList` | |
| `mergeJobApplication` | `mergeApplication` | |
| `companyName` | `company` | |
| `jobLink` | `jobPostingUrl` | |
| `companyResearch` | `companyResearchNotes` | |
| `isArchived` (boolean, default `false`) | `archivedAt` (`string \| null`) | |
| `interviewStatus: string` | closed `InterviewStatus` enum | suggestions, not a closed set |
| `finalResult: string` | closed `FinalResult` enum | suggestions, not a closed set |
| *(removed)* | `attachmentIds` | Part 5 keys files by application id |

Part 1 helpers, named as the plan asks, thin wrappers over `LocalRecordStore`
via `getStorage()`:

- `getAllApplications()`
- `saveApplication(app)` — upsert by id
- `deleteApplication(id, { permanent?: boolean })` — soft delete unless `permanent`

---

## Three defensible deviations from Part 1's wording

1. **TypeScript, not JavaScript.** Strict + `noUncheckedIndexedAccess`. The plan
   said "JavaScript object/type"; the type is the contract.
2. **The home page runs a verification harness** instead of the plan's "plain
   unstyled list of field names" placeholder. CRUD screens start in Part 2.
3. **The IndexedDB attachment store exists ahead of Part 5 but is inert.** The
   seam and the byte-exact self-test are real; nothing in the UI calls it yet.
   `purge()` already cascades via `attachments.removeAllFor(applicationId)` so
   Part 5 does not grow a second delete path.

---

## Resolved conflicts

These were open while the plan file was truncated. The spec settled them:

| Conflict | Resolution |
| --- | --- |
| Status sets | Plan's 7 stages. Legacy `Followed Up` / `Phone Screen` dropped. |
| Follow-up count | Single `followUpDate`. |
| Calendar export | `.ics` is **per-event**, from a button beside each date, not a bulk export. |
| Legacy `jobs.csv` | **Not** a compatibility target. Empty header in job-search-agent; no user data to migrate. |

---

## Corrected 12-part table

From the spec, not the earlier reconstruction.

| # | Part | Delivers |
| --- | --- | --- |
| 1 | Project setup + data model | `JobApplication`, localStorage persistence, named helpers, verified foundation |
| 2 | Add / Edit / Delete + list view | 7-column list (updatedAt desc), add/edit form, tag chips, unpolished delete confirm |
| 3 | Status pipeline (Kanban) | Board columns in pipeline order; list/board toggle; status change from the board |
| 4 | Search, filter, sort | Company/title search, status/portal/tag filters, date/name sort, clear filters |
| 5 | File attachments | IndexedDB blobs keyed by application id; PDF/DOC/DOCX; cascade on permanent delete |
| 6 | Link, notes, nudge, duplicates | Clickable job link, notes/research previews, final-result nudge, duplicate warning |
| 7 | Follow-ups + calendar | Dashboard of due follow-ups and upcoming interviews; per-event `.ics` |
| 8 | Analytics + weekly goal | Counts, response rate, portal breakdown, weekly goal (Mon–Sun) |
| 9 | Archive + undo-delete | Archive/restore; permanent delete + attachment cascade; archived tab |
| 10 | Bulk actions | Multi-select, bulk status/tag/archive; bulk permanent-delete on Archived |
| 11 | Backup export/import | JSON (attachments as base64) + CSV (no files); merge import, skip exact dupes |
| 12 | Visual polish | Part 12 palette, responsive list/board, empty states, toasts, end-to-end pass |

Each part: implement → `tsc -b` + `vitest run` + `npm run build` → summary → **stop**.

---

## Standing rules

- Nothing in UI code touches `localStorage` or `indexedDB` directly. Go through
  `getStorage()`; persistence is `RecordStore` + `AttachmentStore`. If a part
  needs a capability the adapter lacks, extend the interface **and**
  `src/lib/selfTest.ts` in the same commit.
- Field names stay exactly as the table above. Any future rename gets a PLAN.md line.
- Archive is never the same as permanent delete. Files cascade only on permanent delete.
- All reads/writes pass through the single normaliser in `src/lib/normalize.ts`.
- Do **not** add a state library or a component library. Do **not** add a backend.
- `STATUS_TONE` matches Part 12's palette exactly: gray=Saved, blue=Applied,
  purple=Shortlisted, amber=Interview, green=Offer, red=Rejected, slate=Withdrawn.
  Saved and Withdrawn are both gray-family, so they separate by weight
  (`slate-400` vs `slate-600`), not hue.
- No forward-referenced dead code. Settings / duplicate-key helpers / `DATE_FIELDS`
  / `TEXT_FIELDS` wait for the part that uses them.

---

## Optional Later Upgrade

Swap the local adapters for `RestAdapter`: Express/Fastify + SQLite, same record
shape, plus `owner_id` and a login if it ever leaves one browser. Attachments move
from IndexedDB to disk/object storage behind the same `AttachmentStore` interface.
No component rewrites if Parts 1–12 keep the seam.
