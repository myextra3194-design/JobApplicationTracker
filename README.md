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
| `npm test` | 27 unit + integration tests (pure logic, plus the browser path under jsdom) |
| `npm run typecheck` | Type-check only |

Any static host works for deployment: the contents of `dist/`, GitHub Pages, Netlify,
or Cloudflare Pages.

## Where your data lives

| What | Where | Key |
| --- | --- | --- |
| Applications | `localStorage` | `jat.applications.v1` |
| Files (CVs, screenshots) | `IndexedDB` | db `jat-files`, store `attachments` |

Records are one JSON document `{ version, savedAt, records: [...] }`. Files are stored as
bytes in IndexedDB because `localStorage` is a string API and cannot hold a PDF.

- **Archive and delete are different things.** Deleting is soft, so undo works; archived
  rows leave the board but stay restorable.
- **Corrupt data is never destroyed.** An unreadable document is copied to
  `jat.applications.v1.corrupt` and the app starts empty instead of throwing.
- To wipe everything: DevTools → Application → clear site data.

## Architecture

```
src/lib/
  types.ts        ApplicationRecord — the one data shape the whole app shares
  pipeline.ts     stage order, terminal stages, follow-up-due rule, week math
  normalize.ts    every read/write passes through here; junk input cannot reach a view
  query.ts        filter/sort/aggregate as pure functions
  blob.ts         byte access with a FileReader fallback
  storage/
    adapter.ts            RecordStore + AttachmentStore interfaces   ← the seam
    localRecordStore.ts   localStorage implementation
    idbAttachmentStore.ts IndexedDB implementation
    index.ts              getStorage() — the only place either is chosen
```

**Nothing in the UI touches `localStorage` or `indexedDB` directly.** Components call
`getStorage()`. That is what makes the backend optional rather than a rewrite: a REST +
SQLite implementation of the same two interfaces can be swapped in behind
`VITE_STORAGE_DRIVER=rest` without touching a component. See `PLAN.md` §E.

`src/lib/selfTest.ts` runs 12 checks against the real storage stack in the browser —
CRUD, undo-delete, archive, bulk edits, concurrent writes, corrupt-data recovery and a
byte-exact file round-trip. The home page shows the results; each check uses its own
isolated key, so running it never touches your data.

## Stack

React 19 · Vite 8 · TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) · Tailwind CSS 4
· `idb` 8 · Vitest 4. No component library and no state library: the record list is the
state, and it lives behind the storage adapter.

## Status

Part 1 of 12 — foundation. The data model, pipeline rules, storage layer, tests and
verification harness exist; the CRUD screens, board, dashboard and export are the
following parts. Progress and the part-by-part plan are in [`PLAN.md`](PLAN.md).
