# Job Application Tracker — Build Plan for LMArena Agent Mode

This plan breaks the app into 12 parts. Paste each "PROMPT" block into
LMArena Agent Mode one at a time, in order. Let it finish and check the
result before moving to the next part. Don't paste all prompts at once —
that's exactly what causes half-built, broken apps.

> **Updated from the first version** with the extras you asked for:
> file attachments, tags, company research notes, calendar export,
> archive/undo-delete instead of hard delete, bulk actions, and a
> weekly application-goal tracker. New/changed parts are marked below.

---

## 1. What We're Building

A single-page web app to track job applications from "Saved" through to
a final result, with follow-up and interview dates, recruiter contacts,
resume/CV attachments, and a dashboard with a weekly goal tracker.

**Tech stack (recommended):**
- React + Vite + Tailwind CSS
- Structured data stored in the browser via localStorage; file
  attachments stored via IndexedDB (localStorage can't hold files) —
  still entirely client-side, no backend, no login
- Deployed as a static site (Agent Mode can host it directly, or you
  push it to GitHub Pages / Netlify / Vercel)

Why no backend for now: this is a personal tool used by one person on
one browser at a time, and IndexedDB is enough to store attachments
locally. A backend adds auth, hosting cost, and complexity you don't
need yet — see the "Optional Later Upgrade" section at the end for
when it's actually worth adding one.

**Data fields** (every application record has these):
Company name, Job title, Job location, Application date, Job
portal/source, Application status, Recruiter name, Recruiter
contact (email/phone), Follow-up date, Interview date, Interview
status, Salary/package, Job posting link, Notes, Company research
notes, Tags, Resume/CV attachments, Final result.

**Status pipeline:**
`Saved → Applied → Shortlisted → Interview → Offer → Rejected → Withdrawn`

**Other capabilities:** search/filter/sort, a follow-up & interview
dashboard with .ics calendar export, analytics with a weekly
application-goal tracker, archive instead of permanent delete (with
undo), bulk multi-select actions, and full JSON/CSV backup including
attachments.

---

## 2. How to Use This Plan

1. Open LMArena, go to Agent Mode.
2. Paste the **Part 1** prompt exactly as written. Let it build.
3. Test what it built (click around, add a fake entry, check it saves).
4. Paste **Part 2** in the *same session* so it has the existing code
   as context. Repeat through Part 12.
5. If a step breaks or looks wrong, don't move on — paste the error
   message or describe the bug back into the same session first, e.g.
   *"The status dropdown in the edit form doesn't save. Fix it before
   we continue."*
6. If the session ever loses context (new chat, or agent seems
   confused about existing code), start your next prompt with:
   *"Here's the current app: [paste or attach the code/repo]. Continue
   from here."*
7. After each part, if Agent Mode supports it, save/export the code
   or push to GitHub so you never lose progress to a session reset.

---

## 3. The Prompts

### Part 1 — Project Setup + Data Model

```
Create a new React + Vite web app called "Job Application Tracker."
Use Tailwind CSS for styling.

Set up the data model as a JavaScript object/type called
JobApplication with these fields:
- id (unique, auto-generated)
- companyName (text, required)
- jobTitle (text, required)
- jobLocation (text)
- applicationDate (date)
- jobPortal (text) — e.g. LinkedIn, Indeed, company website
- status (one of: "Saved", "Applied", "Shortlisted", "Interview",
  "Offer", "Rejected", "Withdrawn") — default "Saved"
- recruiterName (text)
- recruiterContact (text) — email or phone
- followUpDate (date)
- interviewDate (date)
- interviewStatus (text) — e.g. "Not scheduled", "Scheduled",
  "Completed", "Cancelled"
- salary (text) — free text so it can hold ranges/currencies
- jobLink (text/url)
- notes (long text)
- companyResearch (long text) — background info on the company,
  separate from notes about the application process
- tags (array of strings) — freeform labels like "Remote", "Referral"
- isArchived (boolean, default false)
- finalResult (text) — e.g. "Pending", "Hired", "Rejected", "Ghosted"
- createdAt, updatedAt (timestamps, auto-managed)

Set up localStorage persistence for this data: saved to and loaded
from the browser's localStorage under a single key, so data survives
a page refresh. Write simple helper functions: getAllApplications(),
saveApplication(app), deleteApplication(id).

Don't build file attachment storage yet — we'll add IndexedDB for
that in a later step. For now, just show a plain unstyled list of the
field names on the homepage as a placeholder. Confirm the project
runs and localStorage read/write works before moving on.
```

### Part 2 — Add / Edit / Delete + List View

```
Now build the core CRUD screens for the Job Application Tracker.

1. A table/list view on the homepage showing all non-archived
   applications, with columns: Company, Job Title, Status, Applied
   Date, Follow-up Date, Interview Date, Tags. Sort by most recently
   updated first.

2. An "Add Application" button that opens a form (modal or separate
   page — your choice) with all the fields from the data model,
   including a Tags input (type a tag and press enter to add it as a
   chip, removable) and a Company Research textarea. Status defaults
   to "Saved." Only Company Name and Job Title are required;
   everything else is optional.

3. Clicking a row opens the same form pre-filled, in edit mode, so I
   can update any field including status.

4. A delete button on each row with a confirmation prompt for now —
   we'll change this to an archive/restore flow in a later step, so
   don't spend extra time polishing the delete flow yet.

5. Every add/edit/delete should immediately update localStorage and
   the list view.

Keep the styling simple and clean for now — a basic card/table layout
with Tailwind, nothing fancy yet. We'll polish the design later.
```

### Part 3 — Status Pipeline (Kanban Board View)

```
Add a second view: a Kanban-style board showing applications grouped
into columns by status, in this exact order:
Saved | Applied | Shortlisted | Interview | Offer | Rejected | Withdrawn

Only show non-archived applications. Each column shows cards for the
applications in that status, with the company name, job title, applied
date, and any tags visible on the card.

Add a toggle at the top of the page to switch between "List View"
(from Part 2) and "Board View" (this Kanban board).

Make status changeable directly from the board — either drag-and-drop
between columns, or a simple dropdown/button on each card to move it
to the next/previous status. Either approach is fine, pick whichever
is simpler to implement reliably. Changing status here should update
the same data as the list view (they're both reading/writing the same
localStorage data).
```

### Part 4 — Search, Filter, Sort

```
Add search and filtering to the List View (and Board View if it makes
sense there too):

1. A search box that filters by company name or job title as I type.
2. A filter dropdown for Application Status (multi-select — I should
   be able to view e.g. only "Applied" + "Interview" at once).
3. A filter for job portal/source.
4. A filter for Tags (multi-select — show only applications that have
   at least one of the selected tags).
5. Sort controls on the list view: by application date, follow-up
   date, interview date, or company name, ascending/descending.
6. A "Clear filters" button that resets everything.

Make sure filters and search combine correctly (e.g. searching "Acme"
while filtered to "Interview" status only shows Acme rows that are in
Interview status).
```

### Part 5 — File Attachments (Resume/CV) — NEW

```
Add file attachment support to each application, so I can attach a
resume/CV (and optionally a cover letter) used for that specific
application.

1. Set up IndexedDB (separate from the localStorage application data)
   to store uploaded files as blobs, keyed by application id.
   localStorage isn't suitable for file data.
2. In the Add/Edit form, add a file upload field ("Attach resume/CV").
   Accept PDF, DOC, DOCX. Allow more than one file per application
   (e.g. resume + cover letter), each with a short label I can type in.
3. Show attached files as a small list on the application card/detail
   view, each with filename, file size, and "Download" and "Remove"
   actions.
4. Enforce a per-file size limit (e.g. 5MB) and show a clear error
   message if exceeded.
5. When an application is deleted or archived-and-then-permanently-
   deleted (see the Archive step later), also delete its files from
   IndexedDB so storage doesn't fill up with orphaned files.

Test: attach a file, refresh the page, confirm the file is still there
and downloadable.
```

### Part 6 — Job Link, Notes, Final Result Nudge & Duplicate Check

```
Refine the application detail/edit form:

1. Make the Job Posting Link field render as a clickable "Open
   posting" link (opens in a new tab) wherever an application is
   shown in read mode, not just in the edit form.
2. Show a short preview (first line or ~60 characters, with "...")
   of both Notes and Company Research in the list view, since they
   can get long — keep them as separate previews so it's clear which
   is which.
3. When status is set to "Rejected" or "Withdrawn," prompt me to also
   fill in Final Result if it's still empty — a gentle inline nudge,
   not a blocking popup.
4. Add a duplicate-check warning: when adding a new application, if
   an entry already exists with the same Company Name and Job Title,
   show a warning ("You already applied to this role — continue
   anyway?") instead of silently allowing duplicates.
```

### Part 7 — Follow-ups, Interview Reminders & Calendar Export

```
Add a "Dashboard" or "Upcoming" section (a new tab/page) that surfaces
time-sensitive items:

1. "Follow-ups due" — applications where followUpDate is today or in
   the past, and status is not Rejected/Withdrawn/Offer, excluding
   archived applications. Sort soonest first.
2. "Upcoming interviews" — applications with an interviewDate in the
   future, sorted soonest first, showing company, job title, interview
   date, and interviewStatus.
3. Visually flag overdue follow-ups (red) versus upcoming ones (amber).
4. Each item links to / opens that application's edit form so I can
   update it directly from here.
5. Add an "Add to calendar" button next to any follow-up date or
   interview date (both here and on the application detail view) that
   downloads a .ics file for that single event, with the company name
   and job title in the event title, so I can import it into Google
   Calendar or Outlook.

Keep this page short and scannable — it's meant to answer "what do I
need to do today?" at a glance, not be a full data table.
```

### Part 8 — Analytics Dashboard + Weekly Goal Tracker

```
Add an analytics section (can live on the same Dashboard page as the
previous step, or its own tab):

1. Total number of active (non-archived) applications.
2. A breakdown count by status (Saved, Applied, Shortlisted, Interview,
   Offer, Rejected, Withdrawn) as a simple bar or donut chart plus
   raw numbers.
3. Response rate: percentage of applications that moved past "Applied."
4. Applications grouped by job portal/source.
5. Applications submitted per week/month over time (bar chart).
6. A "Weekly Goal" tracker: let me set a target number of applications
   to submit per week (a simple settings input, saved locally). Show
   the current week's progress as "X of Y applications this week" with
   a progress bar, based on applicationDate falling in the current
   week (Mon–Sun). Show the last 4 weeks as a small history so I can
   see whether I'm keeping pace.

Use lightweight charting (simple CSS bars are fine) — the numbers
matter more than chart polish.
```

### Part 9 — Archive + Undo-Delete — NEW

```
Change how deletion works so I don't lose data by accident:

1. Replace the current hard-delete from Part 2 with an "Archive"
   action. Archiving sets isArchived to true and hides the application
   from the main List/Board/Dashboard views but keeps the data (and
   attachments) intact.
2. Add an "Archived" view (a tab or filter toggle) showing all
   archived applications, with a "Restore" button to bring one back
   to active, and a separate "Delete permanently" button (with a
   confirmation prompt) that actually removes the record and its
   attachments for good.
3. Keep a confirmation prompt on Archive too, but word it clearly as
   non-permanent: "Archive this application? You can restore it later
   from the Archived tab."
4. Update the Dashboard/Analytics counts to exclude archived
   applications by default, but show the archived count somewhere
   small (e.g. "12 archived" near the filters) so it's not hidden.
```

### Part 10 — Bulk Actions — NEW

```
Add bulk actions to the List View:

1. Add a checkbox on each row (and a "select all" checkbox in the
   header) to multi-select applications.
2. When one or more rows are selected, show a small action bar with:
   "Change status to..." (dropdown), "Add tag..." (text input),
   "Archive selected", and — only when viewing the Archived tab —
   "Delete selected permanently".
3. Each bulk action should apply to every selected row, update
   localStorage/IndexedDB accordingly, then clear the selection.
4. Show a confirmation before any bulk archive or bulk permanent-
   delete, stating how many records are affected (e.g. "Archive 6
   applications?").
```

### Part 11 — Backup: Export / Import (including attachments)

```
Add data backup so my tracker isn't only sitting in one browser:

1. An "Export" button that downloads all applications — including
   tags, company research, archived items, and attached files — as a
   JSON file, with a filename like
   job-applications-backup-YYYY-MM-DD.json. Also offer a CSV export
   for the structured fields (note in the UI that CSV export excludes
   attached files, since CSV can't hold binary data).
2. Encode attached files as base64 inside the JSON export so a full
   JSON export/import round-trip restores attachments too. Warn me if
   the export is getting large (e.g. over 20MB) since base64
   attachments make the file heavy.
3. An "Import" button that lets me upload a previously exported JSON
   file and restores applications (and their attachments) — merging
   with existing data rather than wiping it, and skipping exact
   duplicates (same company + job title + application date).
4. Put both buttons in a Settings/Data menu, not cluttering the main
   list view.

Test that exporting then re-importing the same file — including one
with an attachment — doesn't create duplicates and restores the
attachment correctly.
```

### Part 12 — Visual Polish, Responsive Layout, Final Pass

```
Do a final design and usability pass over the whole app:

1. Apply a clean, modern visual style with Tailwind — consistent
   spacing, a clear color for each status (gray=Saved, blue=Applied,
   purple=Shortlisted, amber=Interview, green=Offer, red=Rejected,
   slate=Withdrawn) used consistently across List, Board, and
   Dashboard. Show tags as small colored chips.
2. Make sure the layout works on mobile width (narrow screens) — the
   table becomes a stacked card list below ~640px, the Kanban board
   scrolls horizontally, and the bulk-select action bar stays usable
   on small screens.
3. Add empty states — "No applications yet — add your first one" with
   the Add button visible, and a distinct empty state for the Archived
   view.
4. Add a confirmation toast/snackbar on save, archive/restore, bulk
   actions, import, and export.
5. Final end-to-end check: add an application with tags, company
   research notes, and an attachment; move it through every status on
   the board; set follow-up/interview dates and export one to
   calendar; confirm the dashboard and weekly goal update correctly;
   archive it, restore it, then bulk-select and archive a few; export
   everything and re-import into a fresh browser profile (or incognito
   window) to confirm it fully restores, attachments included. Fix
   anything that breaks along the way.
```

---

## 4. Optional Later Upgrade (not part of this build)

Everything above runs in your browser (localStorage + IndexedDB) with
no login — including file attachments. That covers single-device use
well.

You mentioned you're open to adding a backend later — when you're
ready, that's the natural next step and would get you:
- Access to your tracker (and attachments) from more than one device
  (phone + laptop)
- Cloud backup that doesn't depend on manually exporting JSON
- Basic auth, so the data isn't just sitting in one browser

Supabase or Firebase are reasonable options — both have free tiers and
handle auth, database, and file storage together, so you wouldn't be
stitching multiple services together. Treat this as a separate project
from Parts 1–12, worth starting once the local version is working and
you know which fields/views you actually use day to day — not before.

---

## 5. Working With Agent Mode — Practical Notes

- One part per prompt. Resist the urge to combine parts to save time —
  it's the fastest way to end up with a half-broken app you can't debug.
- Always test before moving on. Catching a bug at Part 3 takes two
  minutes; catching the same bug at Part 10 means untangling it from
  seven parts of code built on top of it.
- Keep a copy of the code (download/export or push to GitHub) after
  each part, in case a session resets or loses context.
- If Agent Mode drifts or misunderstands, don't fight it in the same
  broken thread for too long — restate clearly what exists and what
  you want fixed, once. If it's still stuck after that, it's often
  faster to paste the current code into a fresh prompt with a clear
  "here's what exists, here's the one thing to fix" instruction.
