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
or Cloudflare Pages.

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

Part 1 of 12 — foundation, with field names reconciled to the plan. The data model,
pipeline rules, storage layer, tests and verification harness exist; the CRUD screens,
board, dashboard and export are the following parts. The spec is
[`job-application-tracker-build-plan.md`](job-application-tracker-build-plan.md);
progress and locked decisions are in [`PLAN.md`](PLAN.md).
