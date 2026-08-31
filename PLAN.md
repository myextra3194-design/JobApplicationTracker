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
- **One cascade path.** `purgeApplication(id, { records, attachments })` in
  `src/lib/storage/index.ts` is the only code that deletes a record and its files,
  and `getStorage().purge` is a one-line call to it. Part 5 grew no second delete
  path; Part 10's bulk permanent delete (`getStorage().bulkPurge` ->
  `bulkPurgeApplications`) loops that same function per id rather than
  re-implementing a cascade. The cascade checks in `src/lib/selfTest.ts`
  run this exact function against isolated stores, so a future cascade
  that forgets the files fails the harness rather than silently leaking storage.
- Soft delete (`records.remove`) and archive (`records.setArchived`) never touch
  files — the undo window has to bring the CV back with the row. Part 9's
  permanent delete is what calls `purgeApplication`.
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
- Repo state check (2026-08-31): this checkout contains **Parts 1–12**. Part 3 was
  rebuilt to spec after the old board branch was found never merged: List/Board
  toggle at the top of the page, the seven columns in pipeline order, non-archived
  only, and status change via a dropdown on the card (no drag-and-drop) — same
  store as the list. Part 4's search/filters/sort live in `src/lib/query.ts` as
  `filterToQuery` / `DEFAULT_FILTERS` / `hasActiveFilters` on top of `applyQuery`,
  which gained the multi-tag `tags`, the `jobPortal` filter and the `interviewDate`
  sort key (extended, not duplicated). One toolbar drives both views: the list
  hides non-matching rows, the board dims them and does not sort.
  Part 5's attachments are in: IndexedDB blobs keyed by application id, an
  "Attach resume/CV" upload in the add/edit form (PDF/DOC/DOCX, 5 MB per file,
  multiple files each with a label you type), a per-file Download/Remove on the
  saved list, and the 13th foundation check. Staged files are written only after
  the record has an id, so a cancelled form never orphans a blob.
  Part 6 is in: clickable "Open posting" links in list rows and board cards
  (normalised once on write, never re-normalised on render; nothing clickable
  when `jobLink` is empty), the `previewText` helper in `src/lib/preview.ts`
  (first non-blank line, ~60 chars, word-boundary "...") driving two separate
  Notes / Company Research previews, the final-result nudge rule
  (`finalResultIsFilled` / `needsFinalResultNudge` in `src/lib/form.ts` —
  blank-or-`Pending` counts as not filled; Rejected/Withdrawn only; never
  blocks saving), and the add-only duplicate warning (`duplicateKey` /
  `findDuplicates` in `src/lib/duplicates.ts` — case-insensitive, trimmed,
  excludes archived and deleted rows, edit mode never warns).
  Part 7 is in: an Upcoming tab on the existing List/Board toggle (no router),
  `dueFollowUps` wrapping `isFollowUpDue` and `upcomingInterviews` in
  `src/lib/upcoming.ts` (archived and deleted excluded; follow-ups soonest-first
  with overdue red / due-today amber; interviews strictly in the future, calm
  sky treatment), each item opening that application's edit form, and a per-event
  `.ics` download (`buildIcsEvent` / `icsFilename` in `src/lib/ics.ts` — all-day
  `DTSTART;VALUE=DATE`, CRLF, SUMMARY "Company — Job Title", UID
  `${applicationId}-${date}`) from a button beside each date on the dashboard
  and in the form. No field names changed; record still has no `attachmentIds`,
  `deletedAt` stays as the undo window, and the 13th foundation check is untouched.
  Part 8 is in: the analytics dashboard (`AnalyticsPanel` on the Upcoming tab) —
  total active, breakdown by status, response rate, portal breakdown, per-week and
  per-month submission bars, and the Monday-based weekly goal (Part 8's `weekKeyOf`
  / `applicationsByWeek` / `applicationsByMonth`, persisted via `SettingsStore`).
  Part 9 is in: the list's Delete became **Archive** (exact plan copy
  "Archive this application? You can restore it later from the Archived tab."),
  an **Archived** tab (`ArchivedList` + `src/lib/archive.ts`) with Restore and
  "Delete permanently", and an "N archived" count beside the filters. Archive and
  soft delete still never touch files — only permanent delete cascades, through
  the one `getStorage().purge` → `purgeApplication` path. No field names changed;
  `isArchived` stays boolean, no `attachmentIds`, `deletedAt` stays the undo window,
  and the self-test is still 14 checks.
  Part 10 is in: checkbox multi-select on both tables (per-row box + a
  select-all header box with an indeterminate state, driven by the shared
  `src/components/useRowSelection.ts` hook) and a `BulkActionBar` shown once
  anything is ticked. "Change status to…" and "Add tag…" exist on both the List
  View and the Archived tab; "Archive selected" (confirm "Archive N
  applications?") is List View only, and "Delete selected permanently" (confirm
  "Delete N applications permanently? …it cannot be undone.") is Archived tab
  only, exactly as the plan gates them. Status/archive persist via
  `records.bulkPatch`, tags via a per-row merge (`mergeTagIntoTags` in
  `src/lib/bulk.ts` — trim, case-insensitive dedupe, original casing kept).
  Bulk permanent delete needed a capability the adapter lacked, so the
  `TrackerStorage` seam gained **`bulkPurge(ids): Promise<number>`**
  (`src/lib/storage/adapter.ts`) implemented as `bulkPurgeApplications` in
  `src/lib/storage/index.ts` — it loops the existing `purgeApplication` once
  per id; there is still exactly one cascade path, and unknown/duplicate ids
  are skipped. Every bulk action applies to the whole current selection, then
  clears it (a declined confirmation or failed write keeps the ticks). The
  15th foundation check exercises the bulk cascade, including the
  unselected-row-survives and duplicate/unknown-id cases; `src/lib/bulk.spec.ts`
  covers the pure merge/confirmation logic. No field names changed; the
  normaliser is untouched.
  Part 11 is in: backup export/import, from the header's **Data** menu (a small
  dropdown beside Add Application, so the list view stays clean). Export writes
  `job-applications-backup-YYYY-MM-DD.json` from `records.all()` — every row,
  `isArchived` and `deletedAt` included — with each attachment inlined as base64,
  and offers a CSV of the structured fields (with a BOM, CRLF lines and RFC 4180
  quoting), whose menu note says plainly that attached files are not in it because
  CSV cannot hold binary data. An export over 20 MB asks first (`EXPORT_WARN_BYTES`
  + `exportSizeNote`), because base64 makes the file heavy. Import **merges**: rows
  whose `backupDedupeKey` (company + job title + application date, trimmed and
  case-insensitive, all local rows considered so archived ones block a re-import)
  is already here are skipped, and nothing is ever deleted or replaced — the
  deliberately different sibling of `duplicates.ts`, which keys on company + title
  and excludes archived/deleted rows for the add-form warning. A new row keeps its
  id unless a local row already owns it, in which case a fresh one is minted and
  that row's files are re-keyed before they are written; attachments are written
  only after their record exists, the Part 5 ordering rule.
  Everything backup-shaped is pure and in `src/lib/backup.ts` (payload shape +
  parse, base64 both directions, the merge diff, the CSV text, the summary copy),
  with two thin async helpers that are *handed* the stores — `collectBackup` and
  `runImport` — so the component does upload/download only and the self-test can
  run the same code against isolated stores. **No adapter capability was needed:**
  the export reads `records.all()` + `attachments.listFor/get`, the import writes
  through the existing `records.create(input)` (which honours a supplied id) and
  `attachments.add`, and the import path deliberately never calls `replaceAll` — a
  merge must not be able to rewrite rows it never looked at. The one cascade path is
  untouched: a backup restores, it removes nothing. Corrupt or foreign files come
  back as a readable message (`{ ok: false, message }`, never a throw), a bad
  attachment is one line in the result while its record and the other files still
  land, and every imported row passes through the single normaliser. The 16th
  foundation check round-trips through the real stores — two records (one archived)
  plus a CV, export, empty the store, import, records and file bytes identical, and
  a second import adds zero records and zero files — and `src/lib/backup.spec.ts`
  (42 tests) covers the payload/parse rules, base64 against the RFC 4648 vectors,
  the merge decisions and the CSV quoting. No field names changed; the normaliser
  is untouched.
  Part 12 is in: the visual pass keeps `STATUS_TONE` as the one status palette,
  adds a shared deterministic `tagColor` helper plus `TagChip`, and makes List
  and Archived switch from tables to stacked cards below the 640px `sm` breakpoint.
  The board retains fixed-width columns with horizontal touch scrolling, and the
  bulk bar gets a card-layout "Select all" control that remains usable at 360px.
  List and Board empty states now include the Add action; Archived keeps its own
  distinct empty copy. `ToastHost` is mounted once and consumes the in-memory,
  auto-expiring, de-duped queue in `src/lib/toast.ts`; save, status moves,
  archive/restore, permanent and bulk deletes, bulk edits, import, and both export
  paths all confirm after success while the existing confirmation dialogs and Data
  menu notes remain. No storage seam or self-test capability changed: the harness
  remains at 16 checks. The service-worker shell cache was bumped from `jat-v1` to
  `jat-v2` for the new appearance. `tagColor.spec.ts`, `toast.spec.ts`, and the
  React createRoot browser smoke flow in `src/app.smoke.spec.ts` bring the suite
  to 16 files / 175 tests; the smoke flow also covers the requested end-to-end
  status, calendar, dashboard, archive, bulk, export and attachment restore pass.

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

## Defensible deviations from the spec's wording

1. **TypeScript, not JavaScript.** Strict + `noUncheckedIndexedAccess`. The plan
   said "JavaScript object/type"; the type is the contract.
2. **The home page runs a verification harness** instead of the plan's "plain
   unstyled list of field names" placeholder. CRUD screens start in Part 2.
3. **The IndexedDB attachment store shipped in Part 1, ahead of the UI that uses
   it.** The seam and the byte-exact self-test were real from the start; Part 5
   switched the UI on without inventing persistence. `purge()` already cascaded
   via `attachments.removeAllFor(applicationId)`, so Part 5 grew no second delete
   path. (Recorded here because it front-loaded work the spec orders later; as of
   Part 5 the store is live, not inert.)
4. **Attachment validation lives in `src/lib/attachments.ts`, not the component.**
   `inspectAttachmentFile` takes `{ name, size }` rather than a `File`, so the
   5 MB / PDF-DOC-DOCX rule and its exact copy are unit-testable in plain node and
   the form cannot drift from the message the tests assert. `downloadNameFor`
   derives the stored filename from the label the user types, which is why
   "Download" hands back `Resume.pdf` instead of `cv_final_v3.pdf`.
5. **The reproducible Part 12 end-to-end flow uses `createRoot` + jsdom +
   fake-indexeddb rather than a literal second browser profile.** It still drives
   the rendered App controls (including the form, board, calendar download,
   dashboard, archive/restore, bulk bar, Data menu export/import) and wipes through
   the storage seam before re-importing, which is the clean-profile equivalent;
   attachment bytes are asserted after the round-trip. A live Vite preview was also
   started and served the shell successfully.

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
| 12 | Visual polish + final pass | Shared status/tag visuals, responsive cards and board, empty states, confirmation toasts, final validation |

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
