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
> home-screen app keeps its own storage separate from Safari's tab. There is no sync —
> that is what Part 11's JSON export/import is for (later). Don't test on two devices
> expecting to see the same rows.

## Where your data lives

| What | Where | Key |
| --- | --- | --- |
| Applications | `localStorage` | `jat.applications.v1` |
| Files (CVs, screenshots) | `IndexedDB` | db `jat-files`, store `attachments` |

Records are one JSON document `{ version, savedAt, records: [...] }`. Files are stored as
bytes in IndexedDB because `localStorage` is a string API and cannot hold a PDF. The
IndexedDB store exists now but stays **inert until Part 5**; files are keyed by
application id, not by an `attachmentIds` field on the record.

- **Archive and delete are different things.** `isArchived` hides a row from the board
  but keeps it restorable. `deletedAt` is the undo window between "Delete" and Part 9's
  "Delete permanently". Files cascade only on permanent delete.
- **Corrupt data is never destroyed.** An unreadable document is copied to
  `jat.applications.v1.corrupt` and the app starts empty instead of throwing.
- To wipe everything: DevTools → Application → clear site data.

## Architecture

```
src/lib/
  types.ts        JobApplication — the one data shape the whole app shares
  applications.ts getAllApplications / saveApplication / deleteApplication
  pipeline.ts     stage order, terminal stages, follow-up-due rule, week math
  normalize.ts    every read/write passes through here; junk input cannot reach a view
  query.ts        filter/sort/aggregate as pure functions
  blob.ts         byte access with a FileReader fallback
  storage/
    adapter.ts            RecordStore + AttachmentStore interfaces   ← the seam
    localRecordStore.ts   localStorage implementation
    idbAttachmentStore.ts IndexedDB implementation (inert until Part 5)
    index.ts              getStorage() — the only place either is chosen
```

**Nothing in the UI touches `localStorage` or `indexedDB` directly.** Components call
`getStorage()`. That is what makes the backend optional rather than a rewrite: a REST +
SQLite implementation of the same two interfaces can be swapped in behind
`VITE_STORAGE_DRIVER=rest` without touching a component. See `PLAN.md`.

Named Part 1 helpers (`getAllApplications`, `saveApplication`, `deleteApplication`) are
thin wrappers over that seam.

`src/lib/selfTest.ts` runs 12 checks against the real storage stack in the browser —
CRUD, undo-delete, archive, bulk edits, concurrent writes, corrupt-data recovery and a
byte-exact file round-trip. The home page shows the results; each check uses its own
isolated key, so running it never touches your data.

## Stack

React 19 · Vite 8 · TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) · Tailwind CSS 4
· `idb` 8 · Vitest 4. No component library and no state library: the record list is the
state, and it lives behind the storage adapter.

## Status

Parts 1–4 of 12 — foundation, CRUD list, Kanban board, and search/filter/sort. The data
model, pipeline rules, storage layer, tests and verification harness (Part 1), the list
view with add/edit/delete (Part 2), the List/Board toggle with the seven-column board and
per-card status dropdown (Part 3), and the search/filter/sort toolbar over both views —
the list hides non-matching rows, the board dims them (Part 4) — are in. GitHub Pages
deploy + PWA installability is in. The spec is
[`job-application-tracker-build-plan.md`](job-application-tracker-build-plan.md);
progress and locked decisions are in [`PLAN.md`](PLAN.md).
