# Job Application Tracker — Build Plan

> STATUS: your plan file **never reached the sandbox** after 4 attempts (3 transfer
> failures + the re-attach), so Parts 2–12 are **my reconstruction** in §G/§H, not your
> verbatim text. §A is the only part that came from you. Correct §H and I follow it.
>
> **Part 1 is built and verified** — see §I. `npm run dev` serves it; 27/27 tests pass,
> `tsc -b` clean, production build clean.

---

## A. RECEIVED from you (Part 1 only, cut off mid-sentence)

- 12 parts, pasted to an agent one PROMPT block at a time, checking each before continuing.
- Single-page web app: track applications from "Saved" to a final result, with follow-up and
  interview dates, recruiter contacts, resume/CV attachments, dashboard + weekly goal tracker.
- Recommended stack: React + Vite + Tailwind CSS. Records in **localStorage**, file
  attachments in **IndexedDB** (localStorage can't hold files). No backend, no login.
  Deploy as a static site (Agent Mode host, or GitHub Pages / Netlify / Vercel).
- Rationale for no backend: personal tool, one person, one browser; backend would add auth,
  hosting cost and complexity. An "Optional Later Upgrade" section covers when to add one.
- **Data fields (18):** Company name, Job title, Job location, Application date,
  Job portal/source, Application status, Recruiter name, Recruiter contact (email/phone),
  Follow-up date, Interview date, Interview status, Salary/package, Job posting link, Notes,
  Company research notes, Tags, Resume/CV attachments, Final result.
- **Status pipeline (7):** `Saved → Applied → Shortlisted → Interview → Offer → Rejected → Withdrawn`
- **v2 extras** (new vs first version): file attachments, tags, company research notes,
  calendar export, archive/undo-delete instead of hard delete, bulk actions,
  weekly application-goal tracker.
- Lost at: `**Other capabilities:** s…` and all of Parts 2–12.

## B. DECIDED in chat (binding)

1. Spec source: your attached plan, verbatim — not the agent's guesses.
2. Architecture: plan's client-side stack with a **backend-ready seam** — persistence behind a
   storage-adapter interface so a REST + SQLite/Drizzle layer can be swapped in later without
   touching components. "Optional Later Upgrade" documented here.
3. Cadence: **one part at a time**, agent stops after each part for review in the live preview.
4. Storage: SQLite was the pick for "best free" — overridden by decision 2 (no server now);
   localStorage + IndexedDB is free and needs no signup. SQLite stays the upgrade path.
5. **D3 resolved:** add `match_score` and `cv_version_used` to the record as optional fields,
   so the app stays lossless against your existing CSV. `follow_up_1_date` / `follow_up_2_date`
   are NOT adopted — the plan's single follow-up date stays, unless the plan's later parts say otherwise.
6. **D1/D2 deferred by you** ("Skip"): status set stays undecided until the plan's own text arrives;
   default if the plan is silent = the plan's 7 stages, with Followed Up as an activity-log entry.

## C. INFERRED — your existing tracker, found in `myextra3194-design/job-search-agent`

`utils/tracker.py` is a CSV-backed Streamlit tracker. The new app is almost certainly a
replacement for its `pages/4_📋_Tracker.py`, so its schema is a compatibility target.

| Existing `tracker.py` column | Plan field | Note |
|---|---|---|
| `app_id`, `date_added` | — | plan has no explicit id/created-at; needed for IndexedDB keys + undo-delete |
| `company`, `role_title`, `location` | Company name, Job title, Job location | match |
| `date_applied`, `job_url` | Application date, Job posting link | match |
| `source_platform` | Job portal/source | match |
| `status` | Application status | **conflict, see D1** |
| `recruiter_contacted` | Recruiter name + Recruiter contact | plan splits into 2 fields |
| `follow_up_1_date`, `follow_up_2_date` | Follow-up date | **conflict, see D2** |
| `response_date`, `response_type` | Interview status? | plan's "Interview status" is ambiguous |
| `interview_date` | Interview date | match |
| `outcome` | Final result | match |
| `salary_quoted_qar` | Salary/package | QAR-currency aware |
| `notes` | Notes, + new Company research notes | |
| `match_score`, `cv_version_used` | **absent from plan** | **gap, see D3** |
| — | Tags, Resume/CV attachments, calendar export | plan-only additions |

Existing KPIs computed by `stats()`: `total_tracked`, `applied` (any status ≠ Saved),
`by_status`, `interviews` (Interview + Phone Screen), `offers`,
`response_rate_pct = (interviews + offers) / applied × 100`.
`data/jobs.csv` is **247 bytes = header row only, zero applications**, so there is no
user data to migrate — only the shape of it.

Owner context (from `data/profile.json`): Substation O&M / Technical Assistant at KEIC for
KAHRAMAA, Al Wakrah, Qatar; salary in QAR; sources Bayt, GulfTalent, NaukriGulf, LinkedIn,
Indeed, Glassdoor, Monster, Rigzone; CV versions `CV_QATAR_UTILITY` etc. Hard-coded honesty
rules (≤7 years experience, exact title, no PE/CEng claims) — any sample/demo rows must be
obviously synthetic and must not fabricate credentials.

## D. Open conflicts to resolve before/while building

- **D1 Status sets differ.** Plan: `Saved, Applied, Shortlisted, Interview, Offer, Rejected, Withdrawn`.
  Existing: `Saved, Applied, Followed Up, Phone Screen, Interview, Offer, Rejected, Withdrawn`.
  Neither side has the other's `Shortlisted` / `Followed Up` / `Phone Screen`.
- **D2 Follow-up count.** Existing has two dated follow-ups; plan has one follow-up date.
  Affects reminders + the follow-up chart.
- **D3 Dropped fields — RESOLVED: add both.** `match_score` and `cv_version_used` become optional
  fields on the record (see B5) so CSV round-trips stay lossless.
- **D4 Calendar export format** (`.ics` via Blob download is the assumption) and whether
  follow-up + interview dates both export.
- **D5 Whether the app should also read/import the legacy `jobs.csv` header** so the two tools
  stay interoperable.

## E. Optional Later Upgrade (per plan's own section)

Swap `LocalStorageAdapter` for `RestAdapter`: Express/Fastify + `better-sqlite3`, same record
shape, plus `owner_id` and a login if it ever leaves one browser. Attachments move from
IndexedDB to disk/object storage behind the same `AttachmentStore` interface. No component
rewrites are expected if Part 1 keeps the seam.

## F. Delivery log for this plan file (3 attempts so far)

1. Chat free-text paste → truncated at ~2000 chars, cut off inside Part 1 at
   `**Other capabilities:** s`. Everything in §A is what survived.
2. Attachment `job-application-tracker-build-plan (1).md` → never landed. No
   `/home/user/uploads` directory exists; filesystem-wide `find` for
   `*job-application-tracker*` returned nothing.
3. Checked `/tmp/arena-workspace` (modified at the same minute): contains only
   `coding.diff` / `coding.patch` / `coding-numstat.txt`, which are Arena's own
   patchset snapshots of my `PLAN.md` write — not your upload.

Next attempt (pending): re-attach renamed to `plan.md`. Fallbacks: paste Parts 2-5 /
6-9 / 10-12 in three messages, or give a public raw URL, or tell me to scaffold
Part-agnostically while you find the doc.

## G. Part 1 — delivered and verified

Built (React 19 + Vite 8 + TS 5.9 + Tailwind 4, no backend):

| File | Role |
|---|---|
| `src/lib/types.ts` | `ApplicationRecord`: the 18 plan fields + `id`/`createdAt`/`updatedAt` + `archivedAt`/`deletedAt` + `matchScore`/`cvVersionUsed`. `NewApplication` (create/import, identity allowed) vs `ApplicationPatch` (identity forbidden) |
| `src/lib/pipeline.ts` | 7 stages, terminal/in-progress sets, per-stage colour tokens, `isFollowUpDue`, date-only day math, Monday `weekKeyOf` for the weekly goal |
| `src/lib/normalize.ts` | One normaliser that every read passes through: coerces junk, clamps score 0–100, rejects non-ISO dates, sanitises tags, dedupes ids |
| `src/lib/query.ts` | `ApplicationQuery` filtering/sorting + `summarise()` (dashboard aggregates, response-rate defined exactly as legacy `stats()`) + case-merging `collectTags()` |
| `src/lib/storage/adapter.ts` | **The seam**: `RecordStore`, `AttachmentStore`, `TrackerStorage`, `NotFoundError`/`StorageFullError` |
| `src/lib/storage/localRecordStore.ts` | localStorage impl; whole-document write, mutation queue, corrupt-document quarantine, key injectable for tests |
| `src/lib/storage/idbAttachmentStore.ts` | IndexedDB impl; bytes stored as `Uint8Array`, Blob rebuilt on read |
| `src/lib/storage/index.ts` | `getStorage()` factory + `VITE_STORAGE_DRIVER` switch; `rest` fails loudly with a pointer to §E |
| `src/lib/blob.ts` | `blobToArrayBuffer` with FileReader fallback, `formatBytes` |
| `src/lib/selfTest.ts` | 12-check browser harness, each check on its own storage key |
| `src/App.tsx`, `src/components/*` | Part 1 screen: live store read-out, read-only pipeline preview, self-test panel with Re-run |

Verification, all run here: `tsc -b` clean · `vitest run` **27/27** (24 pure-logic + 3 that
execute the browser path under jsdom + fake-indexeddb) · `vite build` clean
(220 kB JS / 69.9 kB gzip) · dev server on `0.0.0.0:5173` returning 200 with the whole
module graph transforming · Tailwind custom tokens and every used utility confirmed
present in the emitted CSS.

**Three real bugs the harness caught and I fixed:**
1. `sortRecords` pushed missing dates to the top when sorted `desc` — blanks now always
   sink, in both directions.
2. `collectTags` tie-break used `localeCompare` on casing, which flips between locales —
   now insertion-order deterministic.
3. `LocalRecordStore.clear()` queued async work but returned `void`, so it raced the next
   write (and a future "Reset all data" button would too) — now `async`, awaited.
Plus the corrupt-document backup key was timestamped per read (unbounded localStorage
leak); now one fixed `.corrupt` key, never overwritten.

## H. Proposed Parts 2–12 (my reconstruction — replace freely)

| # | Part | Delivers |
|---|---|---|
| 2 | CRUD + form | Add/edit sheet with all fields, validation, delete with Undo snackbar |
| 3 | Table view | Sortable columns, search box, status/tag filters, density toggle |
| 4 | Kanban board | Drag between the 7 stages, per-card company/role/date, WIP-safe drop rules |
| 5 | Reminders | Due/overdue follow-ups + upcoming interviews panel, streak nudge |
| 6 | Tags | Create/rename/merge, colour, tag filter chips shared with §3 |
| 7 | Attachments | Drag-drop files per application, list/preview/download, size budget in UI |
| 8 | Company research | Research-notes panel + source links, separate from interview notes |
| 9 | Dashboard | Counts, funnel, response rate, applications/week chart, source effectiveness |
| 10 | Weekly goal | Goal number + progress ring, per-week history, "N to go today" |
| 11 | Export/import | JSON backup, CSV (legacy 20 columns, lossless vs `tracker.py`), `.ics` calendar |
| 12 | Polish + deploy | Empty/error states, keyboard shortcuts, a11y pass, GitHub Pages workflow |

Each part: implement → `tsc -b` + `vitest run` + build → summary → **stop for your OK**.

## I. Standing corrections to expect

- Nothing in Parts 2–12 may touch `localStorage`/`indexedDB` directly; new state goes
  through `getStorage()`. If a part needs a capability the adapter lacks, extend the
  interface (and `selfTest.ts`) in the same part.
- Archive ≠ delete, always. Hard delete only via explicit purge that cascades attachments.
- `npm run build` stays green every part; the self-test count only grows.
