// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { blobToArrayBuffer } from './lib/blob';
import { readFileAsText } from './lib/backup';
import { toPlainDate } from './lib/pipeline';
import { getStorage } from './lib/storage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * A browser-path smoke test for the final pass. It deliberately uses React's
 * public createRoot/act APIs rather than a component-testing library, and drives
 * the same controls a user sees in the live app.
 */
describe('App final-pass browser flow', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;
  let lastDownload: Blob | null = null;
  let confirmSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    lastDownload = null;
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: (blob: Blob) => {
        lastDownload = blob;
        return 'blob:job-application-tracker-test';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
    if (!window.requestAnimationFrame) {
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
      });
      Object.defineProperty(window, 'cancelAnimationFrame', {
        configurable: true,
        value: (handle: number) => window.clearTimeout(handle),
      });
    }
  });

  afterEach(async () => {
    const storage = getStorage();
    const rows = await storage.records.all();
    if (rows.length > 0) await storage.bulkPurge(rows.map((row) => row.id));
    // The theme toggle writes through the settings seam; reset it so a later
    // smoke case always starts from the app's dark default. Part 13's journals
    // are per-row-key, but clearing them keeps the badge deterministic.
    globalThis.localStorage.removeItem('jat.settings.v1');
    globalThis.localStorage.removeItem('jat.notifications.v1');
    globalThis.localStorage.removeItem('jat.alarms.v1');
    await act(async () => {
      root?.unmount();
    });
    root = null;
    host.remove();
    confirmSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it('adds, progresses, schedules, archives, bulk-archives, exports and restores an attachment', async () => {
    const storage = getStorage();
    await storage.records.replaceAll([]);

    await act(async () => {
      root = createRoot(host);
      root.render(createElement(App));
      await tick();
    });
    await waitUntil(() => document.body.textContent?.includes('List View') === true, 'the app loaded');

    // Add a complete record through the form, including the final-pass fields.
    await clickButton('Add Application');
    await waitUntil(() => document.querySelector('[role="dialog"]') !== null, 'the add form opened');
    await changeControl(findField('Company name'), 'Acme Robotics');
    expect(findField('Company name').value).toBe('Acme Robotics');
    await changeControl(findField('Job title'), 'Staff Engineer');
    await changeControl(findField('Company research'), 'Series B; strong engineering culture.');
    await changeControl(document.querySelector<HTMLInputElement>('input[aria-label="Add tag"]')!, 'priority');
    await keyDown(document.querySelector<HTMLInputElement>('input[aria-label="Add tag"]')!, 'Enter');

    const dates = [...document.querySelectorAll<HTMLInputElement>('input[type="date"]')];
    await changeControl(dates[0]!, toPlainDate(new Date()));
    // Follow-up and interview deliberately share a date: their two "Add to
    // calendar" exports must carry distinct UIDs, or importing both into one
    // calendar silently overwrites the first event with the second.
    await changeControl(dates[1]!, toPlainDate(new Date()));
    await changeControl(dates[2]!, toPlainDate(new Date()));
    const calendarButtons = [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
      (element) => element.textContent?.trim() === 'Add to calendar',
    );
    expect(calendarButtons).toHaveLength(2);
    lastDownload = null;
    await act(async () => {
      calendarButtons[0]!.click();
      await tick();
    });
    const followUpIcs = await readFileAsText(lastDownload!);
    lastDownload = null;
    await act(async () => {
      calendarButtons[1]!.click();
      await tick();
    });
    const interviewIcs = await readFileAsText(lastDownload!);
    const uidOf = (text: string) => text.split('\r\n').find((line) => line.startsWith('UID:'));
    expect(uidOf(followUpIcs)).toContain('follow-up');
    expect(uidOf(interviewIcs)).toContain('interview');
    expect(uidOf(followUpIcs)).not.toBe(uidOf(interviewIcs));

    const file = new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])], 'resume.pdf', {
      type: 'application/pdf',
    });
    const fileInput = document.querySelector<HTMLInputElement>('input[aria-label="Attach resume/CV"]')!;
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await tick();
    });
    // Focus-on-open is asynchronous; set the first controlled field once more
    // after all other form updates so the smoke driver mirrors a real typed value.
    await changeControl(findField('Company name'), 'Acme Robotics');
    await clickButton('Add application');

    await waitUntil(async () => (await storage.records.all()).length === 1, 'the application saved');
    let row = (await storage.records.all())[0]!;
    await waitUntil(async () => (await storage.attachments.listFor(row.id)).length === 1, 'the attachment saved');
    expect(row.companyResearch).toContain('Series B');
    expect(row.tags).toEqual(['priority']);
    expect(await storage.attachments.listFor(row.id)).toHaveLength(1);
    expect(lastDownload).toBeTruthy();

    // Calendar export and the Upcoming dashboard / weekly goal use the saved dates.
    await clickButton('Upcoming');
    await waitUntil(() => document.body.textContent?.includes('Analytics') === true, 'the dashboard opened');
    expect(document.body.textContent).toContain('1 of 5 applications this week');
    await clickButton('List View');

    // Move the same card through every one of the seven pipeline stages.
    await clickButton('Board View');
    for (const status of ['Applied', 'Shortlisted', 'Interview', 'Offer', 'Rejected', 'Withdrawn']) {
      const select = document.querySelector<HTMLSelectElement>('select[aria-label^="Move "]')!;
      await changeControl(select, status);
      await waitUntil(async () => (await storage.records.get(row.id))?.status === status, `${status} saved`);
    }
    row = (await storage.records.get(row.id))!;
    expect(row.status).toBe('Withdrawn');

    // Archive and restore the row, preserving its attachment.
    await clickButton('List View');
    await clickButton('Archive');
    await waitUntil(async () => (await storage.records.get(row.id))?.isArchived === true, 'the row archived');
    await clickButton('Archived');
    await clickButton('Restore');
    await waitUntil(async () => (await storage.records.get(row.id))?.isArchived === false, 'the row restored');
    expect(await storage.attachments.listFor(row.id)).toHaveLength(1);

    // Add two more rows and use the mobile/card-layout select-all affordance to
    // exercise the bulk action path with a few selected applications.
    await clickButton('List View');
    await addSimpleApplication('Blue Harbor', 'Frontend Engineer');
    await addSimpleApplication('Northwind', 'Product Designer');
    expect((await storage.records.all()).filter((item) => !item.isArchived)).toHaveLength(3);
    const selectAll = document.querySelector<HTMLInputElement>('input[aria-label="Select all applications"]')!;
    await act(async () => {
      selectAll.click();
      await tick();
    });
    await clickButton('Archive selected');
    await waitUntil(
      async () => (await storage.records.all()).filter((item) => item.isArchived).length === 3,
      'the bulk archive completed',
    );

    // Export the entire browser state, wipe the records through the storage seam,
    // then import the downloaded JSON as a clean-profile round trip.
    await clickButton('Data ▾');
    lastDownload = null;
    await clickButton('Export (JSON, with files)');
    await waitUntil(() => lastDownload !== null, 'the JSON backup downloaded');
    const backupText = await readFileAsText(lastDownload!);
    const exportedIds = (await storage.records.all()).map((item) => item.id);
    await storage.bulkPurge(exportedIds);
    expect(await storage.records.all()).toHaveLength(0);

    const importInput = document.querySelector<HTMLInputElement>('input[aria-label^="Choose a Job Application Tracker"]')!;
    const backupFile = new File([backupText], 'job-applications-backup.json', { type: 'application/json' });
    Object.defineProperty(importInput, 'files', { configurable: true, value: [backupFile] });
    await act(async () => {
      importInput.dispatchEvent(new Event('change', { bubbles: true }));
      await tick();
    });
    await waitUntil(async () => (await storage.records.all()).length === 3, 'the backup re-imported');
    const restored = await storage.records.get(row.id);
    expect(restored?.companyResearch).toContain('Series B');
    expect(restored?.tags).toEqual(['priority']);
    const restoredFiles = await storage.attachments.listFor(row.id);
    expect(restoredFiles).toHaveLength(1);
    const restoredFile = await storage.attachments.get(restoredFiles[0]!.id);
    expect(restoredFile).not.toBeNull();
    expect(new Uint8Array(await blobToArrayBuffer(restoredFile!.blob))).toEqual(
      new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]),
    );
  });

  it('adds without losing a pending tag, without double-saving, and without duplicating a row when attachments fail', async () => {
    const storage = getStorage();
    await storage.records.replaceAll([]);

    await act(async () => {
      root = createRoot(host);
      root.render(createElement(App));
      await tick();
    });
    await waitUntil(() => document.body.textContent?.includes('List View') === true, 'the app loaded');

    // A tag typed into the tag input but never committed with Enter must be
    // committed by the submit itself, not silently dropped.
    await clickButton('Add Application');
    await waitUntil(() => document.querySelector('[role="dialog"]') !== null, 'the add form opened');
    await changeControl(findField('Company name'), 'Gimlet Media');
    await changeControl(findField('Job title'), 'Podcast Producer');
    await changeControl(document.querySelector<HTMLInputElement>('input[aria-label="Add tag"]')!, 'remote');
    // Deliberately no Enter press here.

    // An out-of-range match score is rejected inline instead of being silently
    // clamped to 100 by the normaliser.
    await changeControl(findField('Match score'), '250');
    await clickButton('Add application');
    await waitUntil(() => document.body.textContent?.includes('Match score must be between 0 and 100') === true, 'the score error showed');
    expect(await storage.records.all()).toHaveLength(0);
    await changeControl(findField('Match score'), '80');

    // Two submissions back-to-back (a double click / double Enter) must produce
    // exactly one record: the second submit is dropped synchronously.
    const form = document.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await tick();
    });
    await waitUntil(async () => (await storage.records.all()).length === 1, 'exactly one application saved');
    const row = (await storage.records.all())[0]!;
    expect(row.tags).toEqual(['remote']);
    expect(row.matchScore).toBe(80);
    await waitUntil(() => document.querySelector('[role="dialog"]') === null, 'the form closed');

    // Escape dismisses the form without saving anything.
    await clickButton('Add Application');
    await waitUntil(() => document.querySelector('[role="dialog"]') !== null, 'the add form reopened');
    await act(async () => {
      document.querySelector('[role="dialog"]')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await tick();
    });
    await waitUntil(() => document.querySelector('[role="dialog"]') === null, 'Escape closed the form');
    expect(await storage.records.all()).toHaveLength(1);

    // When the record is created but its attachment cannot be stored, the form
    // must still close with one row: leaving it open in create mode would let a
    // retry run records.create again and duplicate the application.
    const failingAdd = vi
      .spyOn(storage.attachments, 'add')
      .mockImplementation(async () => {
        throw new Error('simulated attachment failure');
      });
    try {
      await clickButton('Add Application');
      await waitUntil(() => document.querySelector('[role="dialog"]') !== null, 'the add form reopened');
      await changeControl(findField('Company name'), 'Blue Harbor');
      await changeControl(findField('Job title'), 'Frontend Engineer');
      const file = new File([new Uint8Array([37, 80, 68, 70])], 'resume.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector<HTMLInputElement>('input[aria-label="Attach resume/CV"]')!;
      Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
      await act(async () => {
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();
      });
      await clickButton('Add application');
      await waitUntil(async () => (await storage.records.all()).length === 2, 'the second row saved');
      await waitUntil(() => document.querySelector('[role="dialog"]') === null, 'the form closed despite the attachment failure');
      expect(document.body.textContent).toContain('attachments could not be stored');
      expect(document.body.textContent).toContain('simulated attachment failure');
      expect((await storage.records.all()).filter((item) => item.companyName === 'Blue Harbor')).toHaveLength(1);
    } finally {
      failingAdd.mockRestore();
    }

    // The survivor is editable and can take the file on the retry, by hand.
    await clickButton('Add Application');
    await waitUntil(() => document.querySelector('[role="dialog"]') !== null, 'the add form reopened');
    await changeControl(findField('Company name'), 'Northwind');
    await changeControl(findField('Job title'), 'Product Designer');
    await clickButton('Add application');
    await waitUntil(async () => (await storage.records.all()).length === 3, 'the third row saved');
    expect((await storage.records.all()).map((item) => item.companyName).sort()).toEqual([
      'Blue Harbor',
      'Gimlet Media',
      'Northwind',
    ]);
  });

  it('loads dark, toggles to light, persists the choice and shows the active empty state', async () => {
    const storage = getStorage();
    await storage.records.replaceAll([]);

    await act(async () => {
      root = createRoot(host);
      root.render(createElement(App));
      await tick();
    });
    await waitUntil(() => document.body.textContent?.includes('List View') === true, 'the app loaded');
    await waitUntil(() => document.documentElement.classList.contains('dark') === true, 'the dark theme applied');
    expect(document.body.textContent).toContain('No applications yet — add your first one');

    const lightButton = document.querySelector<HTMLButtonElement>('button[aria-label="Switch to light mode"]');
    expect(lightButton).not.toBeNull();
    await act(async () => {
      lightButton?.click();
      await tick();
    });
    await waitUntil(async () => (await storage.settings.get()).theme === 'light', 'the light theme persisted');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    const darkButton = document.querySelector<HTMLButtonElement>('button[aria-label="Switch to dark mode"]');
    expect(darkButton).not.toBeNull();
    await act(async () => {
      darkButton?.click();
      await tick();
    });
    await waitUntil(async () => (await storage.settings.get()).theme === 'dark', 'the dark preference round-tripped');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('shows reminders in the notification bell, opens a row from one, and marks the rest read', async () => {
    const storage = getStorage();
    await storage.records.replaceAll([]);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await storage.records.create({
      companyName: 'Bell Test Co',
      jobTitle: 'QA Engineer',
      status: 'Applied',
      followUpDate: toPlainDate(new Date()),
    });
    await storage.records.create({
      companyName: 'Bell Test Two',
      jobTitle: 'Designer',
      status: 'Interview',
      interviewDate: toPlainDate(tomorrow),
    });

    await act(async () => {
      root = createRoot(host);
      root.render(createElement(App));
      await tick();
    });
    await waitUntil(() => document.body.textContent?.includes('List View') === true, 'the app loaded');

    // Both reminders are unread: the bell badge shows 2.
    const bell = document.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    expect(bell).not.toBeNull();
    await waitUntil(() => bell?.textContent?.includes('2') === true, 'the unread badge shows 2');
    await act(async () => {
      bell?.click();
      await tick();
    });
    await waitUntil(
      () => document.body.textContent?.includes('Follow-up due today') === true,
      'the follow-up reminder is listed',
    );
    expect(document.body.textContent).toContain('Interview tomorrow');

    // Clicking the follow-up item marks it read and opens that row's edit form.
    const followUpItem = [...document.querySelectorAll('button')].find((element) =>
      element.textContent?.includes('Follow-up due today'),
    );
    expect(followUpItem).not.toBeNull();
    await act(async () => {
      followUpItem?.click();
      await tick();
    });
    await waitUntil(() => document.querySelector('[role="dialog"]') !== null, 'the edit form opened from the bell');

    // Reopen the bell: one item remains unread, then Mark all read clears the badge.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      await tick();
    });
    await act(async () => {
      bell?.click();
      await tick();
    });
    await waitUntil(() => document.body.textContent?.includes('Mark all read') === true, 'the bell reopened');
    await clickButton('Mark all read');
    expect(bell?.textContent?.includes('1')).toBe(false);
    expect(bell?.textContent?.trim()).toBe('🔔');
  });
});

async function addSimpleApplication(companyName: string, jobTitle: string): Promise<void> {
  const storage = getStorage();
  await clickButton('Add Application');
  await changeControl(findField('Company name'), companyName);
  await changeControl(findField('Job title'), jobTitle);
  await clickButton('Add application');
  await waitUntil(async () => (await storage.records.all()).some((row) => row.companyName === companyName), `${companyName} saved`);
}

function findField(label: string): Control {
  const dialog = document.querySelector('[role="dialog"]');
  const owner = [...(dialog?.querySelectorAll('label') ?? [])].find((element) => element.textContent?.includes(label));
  const control = owner?.querySelector('input, textarea, select');
  if (!control) throw new Error(`field not found: ${label}`);
  return control as Control;
}

async function changeControl(control: Control, value: string): Promise<void> {
  const prototype = control instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  control.focus();
  setter?.call(control, value);
  await act(async () => {
    control.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
  });
}

async function keyDown(input: HTMLInputElement, key: string): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    await tick();
  });
}

async function clickButton(label: string): Promise<void> {
  const button = [...document.querySelectorAll('button')].find((element) => element.textContent?.trim() === label);
  if (!button) throw new Error(`button not found: ${label}`);
  await act(async () => {
    button.click();
    await tick();
  });
}

async function waitUntil(check: () => boolean | Promise<boolean>, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 10));
    });
  }
  const values = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
    .map((element) => `${element.getAttribute('aria-label') ?? element.type ?? element.tagName}=${element.value}`)
    .join(' | ');
  throw new Error(`timed out waiting for ${description}\n${values}\n${document.body.textContent?.slice(-1200) ?? ''}`);
}

function tick(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
