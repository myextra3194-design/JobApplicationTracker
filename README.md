# Job Application Tracker

Track job applications from **Saved** through to a final result: follow-up and interview
dates, recruiter contacts, CV attachments, tags, company research notes, and a dashboard
with a weekly application goal.

Runs entirely in your browser. **No backend, no account, no network calls** — your
applications never leave this device.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b` typecheck, then production bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm test` | unit + integration tests (pure logic, form helpers, plus the browser path under jsdom) |
| `npm run typecheck` | Type-check only |

Any static host works for deployment: the contents of `dist/`, GitHub Pages, Netlify,
or Cloudflare Pages. Vite builds with a **relative base** (`base: './'`), so the same
`dist/` works at `https://<user>.github.io/JobApplicationTracker/`, on a custom domain,
or from a subfolder.

## Deployed app & installing it on your phone (PWA)

Live at **https://myextra3194-design.github.io/JobApplicationTracker/**. GitHub Pages
serves the committed `docs/` folder ("Deploy from a branch" → *main* → */docs*);
`docs/` is a byte-identical mirror of the built `dist/` (Pages only offers `/` or
`/docs` as the branch source, not `/dist`). Each part's work lands in a fresh
`dist/` build plus an identical `docs/` copy in the same commit — keep them in
sync whenever you build.

The app ships a web manifest, icons, a dark theme color, and a small app-shell service
worker (`public/sw.js`), so you can install it to your home screen and it starts offline:

- **iPhone (Safari):** open the URL → tap **Share** → **Add to Home Screen** → **Add**.
  Launch it from the icon. No browser bar, works offline after first load.
- **Android (Chrome):** open the URL → menu **⋮** → **Add to Home screen** → **Install**
  (Chrome may also show an Install app banner). Launch from the icon.

> ⚠️ **Your data lives in the browser you typed it into.** `localStorage` is per browser *and*
> per install: the phone's data is not the desktop's data, and on iPhone the installed
> home-screen app keeps its own storage separate from Safari's tab. There is no sync.
> To move a tracker between browsers, use the header's **Data ▾** menu: **Export (JSON,
> with files)** on one, **Import from a JSON backup** on the other — the import merges, so
> it will not wipe what is already there, and rows you already have are skipped.

## Where your data lives

| What | Where | Key |
| --- | --- | --- |
| Applications | `localStorage` | `jat.applications.v1` |
| Files (CVs, screenshots) | `IndexedDB` | db `jat-files`, store `attachments` |

Records are one JSON document `{ version, savedAt, records: [...] }`. Files are stored as
bytes in IndexedDB because `localStorage` is a string API and cannot hold a PDF. Files are
keyed by **application id**, not by an `attachmentIds` field on the record — so a record can
never point at a file that was not stored. Attachments are PDF, DOC or DOCX, up to 5 MB each,
with a label you type that becomes the download filename.

- **Archive and delete are different things.** `isArchived` hides a row from the board
  but keeps it restorable. `deletedAt` is the undo window between "Delete" and Part 9's
  "Delete permanently". Files cascade only on permanent delete — and through one
  function only, `purgeApplication()` in `src/lib/storage/index.ts`, so no code path
  can delete a record and forget its blobs. Archive and undo-delete keep the files.
- **Corrupt data is never destroyed.** An unreadable document is copied to
  `jat.applications.v1.corrupt` and the app starts empty instead of throwing.
- **Notifications & alarms (Part 13).** The header bell lists due follow-ups and
  upcoming interviews with an unread badge, and hosts the reminder settings:
  on/off switches, the time of day reminders fire at, an interview lead-day
  reminder (0–7 days), and an opt-in for OS pop-ups. The alarm engine fires
  in-app toasts (and pop-ups, if allowed) while the app is open — local-first
  means there is no server to wake a closed tab. Seen/fired state lives in
  capped `jat.notifications.v1` / `jat.alarms.v1` journals.
- **Follow up 7 days after applying (Part 14).** Every live, in-progress row with
  an application date is treated as due for a follow-up **7 days later** unless
  you typed a follow-up date of your own — nothing has to be scheduled by hand
  for the reminder to exist. The cadence is a setting in the bell panel
  (*Follow up after applying*: off, 3, 5, 7, 10, 14, 21 or 30 days) and it drives
  the bell, the Upcoming dashboard and the in-app alarm alike; derived dates are
  labelled `auto · 7 days after applying` and are never written to the record.
  Typing an application date in the add/edit form pre-fills the follow-up field
  with that date (clear or change it and it stays changed).
- **Calendar events carry the job (Part 14).** "Add to calendar" now writes the
  job's own details into the `.ics` — location, source, application date, stage,
  recruiter, contact, package, tags, notes and research as `DESCRIPTION`, the
  location as `LOCATION`, the posting link as `URL` — and a **follow-up** event
  is a timed entry at your reminder hour with a `VALARM` on it, so the calendar
  app itself rings on the day. Interview events stay all-day markers (an
  interview blocks a day; the calendar's own all-day notification covers it).
  A follow-up entry is titled `Follow up: Company — Role` so it reads as
  something to do, not just a label.
- To wipe everything: DevTools → Application → clear site data.

## Architecture

```
src/lib/
  types.ts        JobApplication — the one data shape the whole app shares
  applications.ts getAllApplications / saveApplication / deleteApplication
  pipeline.ts     stage order, terminal stages, follow-up-due rule, week math
  ics.ts          Part 7/14 — the .ics builder: job details, all-day or alarmed
  normalize.ts    every read/write passes through here; junk input cannot reach a view
  query.ts        filter/sort/aggregate as pure functions
  attachments.ts  Part 5 — size/type rules, label→filename, save/download/remove
  backup.ts       Part 11 — export payload, base64, CSV text, merge-import diff
  alarms.ts       Part 13 — pure alarm derivation + fire/dismiss/schedule decisions
  notifications.ts Part 13 — bell items derived from the same store snapshot
  journal.ts      Part 13 — capped seen/fired key journal (localStorage)
  blob.ts         byte access with a FileReader fallback
  storage/
    adapter.ts            RecordStore + AttachmentStore interfaces   ← the seam
    localRecordStore.ts   localStorage implementation
    idbAttachmentStore.ts IndexedDB implementation (files, keyed by application id)
    index.ts              getStorage() + purgeApplication() — the only place
                          either adapter is chosen, and the one cascade path
```

**Nothing in the UI touches `localStorage` or `indexedDB` directly.** Components call
`getStorage()`. That is what makes the backend optional rather than a rewrite: a REST +
SQLite implementation of the same two interfaces can be swapped in behind
`VITE_STORAGE_DRIVER=rest` without touching a component. See `PLAN.md`.

Named Part 1 helpers (`getAllApplications`, `saveApplication`, `deleteApplication`) are
thin wrappers over that seam.

`src/lib/selfTest.ts` runs 16 checks against the real storage stack in the browser —
CRUD, undo-delete, archive, bulk edits, concurrent writes, corrupt-data recovery, a
byte-exact file round-trip, the attachment cascade (files survive archive and
undo-delete, and go with the record on permanent delete), and a backup round-trip:
export, empty the store, re-import, and assert the records and the attachment bytes
come back identical with a second import adding nothing. This is a development-only
harness (`npm test` runs it under jsdom); its results panel was removed from the app
UI, so the home page no longer shows any test log. Each check uses its own isolated
key, so running it never touches your data.

## Stack

React 19 · Vite 8 · TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) · Tailwind CSS 4
· `idb` 8 · Vitest 4. No component library and no state library: the record list is the
state, and it lives behind the storage adapter.

## Status

Parts 1–13 of 13 are in, plus a Part 14 follow-up pass. The data model, storage seam and verification harness (Part 1);
the add/edit list view (Part 2); the List/Board toggle with the seven-column Kanban board
(Part 3); search/filter/sort over both views (Part 4); PDF/DOC/DOCX attachments keyed by
application id with a per-file 5 MB limit (Part 5); clickable job links, notes/research
previews, the final-result nudge and the duplicate warning (Part 6); the Upcoming
follow-up/interview dashboard with per-event `.ics` (Part 7); the analytics dashboard and
Monday-based weekly goal (Part 8); **archive, restore & permanent delete** (Part 9) —
the list's Delete is now Archive, an Archived tab offers Restore and "Delete permanently"
(which cascades the attachments via `getStorage().purge`), and an "N archived" count sits
beside the filters; checkbox multi-select with bulk status/tag/archive and bulk permanent
delete (Part 10); **backup export/import** (Part 11) — the header's Data menu writes a
JSON backup with attachments as base64 (or a CSV of the structured fields) and reads a
previous backup back in, merging rather than wiping; the Part 12 visual pass (theme,
cards on mobile, toasts); and **notifications & alarms** (Part 13) — the header bell
with derived follow-up/interview reminders and the in-app alarm engine with optional
OS pop-ups (see above). **Part 14** adds the automatic 7-day follow-up cadence
and calendar exports that carry the job's details and alarm on the day (see
above). GitHub Pages deploy + PWA installability is in. The spec is
[`job-application-tracker-build-plan.md`](job-application-tracker-build-plan.md);
progress and locked decisions are in [`PLAN.md`](PLAN.md).
