import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  backupFilename,
  buildCsv,
  CSV_BOM,
  CSV_BINARY_NOTE,
  CSV_MIME,
  collectBackup,
  describeExport,
  downloadTextFile,
  exportSizeNote,
  importSummary,
  JSON_MIME,
  parseBackupJson,
  readFileAsText,
  runImport,
} from '../lib/backup';
import { toPlainDate } from '../lib/pipeline';
import { getStorage } from '../lib/storage';

interface DataMenuProps {
  /** Run after an import wrote anything, so App re-reads its snapshot. */
  onImported: () => void;
}

type Note = { tone: 'info' | 'warn' | 'error'; text: string };

const TONE_CLASS: Record<Note['tone'], string> = {
  info: 'border-hairline bg-surface text-slate-300',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  error: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
};

const NOTE_TEXT_CLASS: Record<Note['tone'], string> = {
  info: 'text-sky-200',
  warn: 'text-amber-200',
  error: 'text-rose-200',
};

/**
 * Part 11: the header's Data menu — export and import live here, not in the list
 * view, because the plan asks for the main table to stay uncluttered.
 *
 * All three actions go through `getStorage()` and `src/lib/backup.ts`; this
 * component decides nothing about the data itself. Export reads the unfiltered
 * snapshot (so the Archived tab and the undo window are in the backup), import
 * merges through the same `records.create` / `attachments.add` seams the add form
 * uses and never deletes, and both report in the menu instead of a modal.
 */
export function DataMenu({ onImported }: DataMenuProps) {
  const storage = getStorage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function exportJson(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const prepared = await collectBackup(storage, new Date().toISOString());
      // The size warning is about the file that would really be written, so it is
      // asked after serialising and before downloading.
      const warning = exportSizeNote(prepared.bytes);
      if (warning !== null && !window.confirm(warning)) {
        setNote({ tone: 'warn', text: 'Export cancelled — nothing was downloaded.' });
        return;
      }
      const filename = backupFilename(toPlainDate(new Date()), 'json');
      downloadTextFile(prepared.json, filename, JSON_MIME);
      const missing = prepared.unreadableFiles;
      setNote({
        tone: missing.length > 0 ? 'warn' : 'info',
        text:
          `${filename} — ${describeExport(prepared.payload, prepared.bytes)}` +
          (missing.length > 0
            ? `\n${missing.length} file(s) were listed by a record but not in the file store, so they are not in the backup:\n${missing.join('\n')}`
            : ''),
      });
    } catch (err) {
      setNote({ tone: 'error', text: `Export failed: ${messageOf(err)}` });
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const rows = await storage.records.all();
      const filename = backupFilename(toPlainDate(new Date()), 'csv');
      // BOM first: without it Excel reads a UTF-8 CSV as Windows-1252 and
      // "Qatar — دoha" arrives as mojibake.
      downloadTextFile(`${CSV_BOM}${buildCsv(rows)}`, filename, CSV_MIME);
      setNote({
        tone: 'info',
        text: `${filename} — ${rows.length} application${rows.length === 1 ? '' : 's'} of structured fields only, no attached files.`,
      });
    } catch (err) {
      setNote({ tone: 'error', text: `Export failed: ${messageOf(err)}` });
    } finally {
      setBusy(false);
    }
  }

  async function importJson(file: File): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const parsed = parseBackupJson(await readFileAsText(file));
      if (!parsed.ok) {
        // Readable, and the important half of the requirement: nothing existing was
        // touched on the way to saying no.
        setNote({ tone: 'error', text: `${file.name}: ${parsed.message}` });
        return;
      }
      const result = await runImport(storage, parsed.backup);
      setNote({
        tone: result.fileErrors.length > 0 ? 'warn' : 'info',
        text:
          `${file.name}: ${importSummary(result, parsed.backup)}` +
          (result.fileErrors.length > 0 ? `\n${result.fileErrors.join('\n')}` : ''),
      });
      if (result.created > 0 || result.filesWritten > 0) onImported();
    } catch (err) {
      setNote({ tone: 'error', text: `Import failed: ${messageOf(err)}` });
    } finally {
      setBusy(false);
    }
  }

  function onPickFile(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    // Cleared before anything else, so picking the same file twice still fires a
    // change event — the export → import → import case has to be repeatable.
    input.value = '';
    if (file) void importJson(file);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Backup: export, CSV and import"
        className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-slate-300 hover:border-sky-500/50 hover:text-slate-100"
      >
        Data ▾
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-80 rounded-lg border border-hairline bg-surface-raised p-2 shadow-xl">
          <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-slate-500">Backup</p>

          <MenuAction
            busy={busy}
            label="Export (JSON, with files)"
            hint="Every application in this browser — tags, company research, archived rows, and attached files as base64."
            onClick={() => void exportJson()}
          />
          <MenuAction
            busy={busy}
            label="Export (CSV, structured fields)"
            hint={CSV_BINARY_NOTE}
            onClick={() => void exportCsv()}
          />
          <MenuAction
            busy={busy}
            label="Import from a JSON backup…"
            hint="Merges into what is here: nothing is deleted, and a row already present (same company + job title + application date) is skipped."
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={onPickFile}
            aria-label="Choose a Job Application Tracker JSON backup to import"
            className="hidden"
          />

          {note ? (
            <p
              role="status"
              aria-live="polite"
              className={`mt-2 whitespace-pre-line rounded-md border px-2 py-1.5 text-[11px] leading-relaxed ${TONE_CLASS[note.tone]} ${NOTE_TEXT_CLASS[note.tone]}`}
            >
              {note.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuAction({
  label,
  hint,
  onClick,
  busy,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-md px-1 py-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-200 hover:bg-surface hover:text-sky-200 disabled:opacity-50"
      >
        {busy ? 'Working…' : label}
      </button>
      <p className="px-2 text-[11px] leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
