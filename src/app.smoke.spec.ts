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
    // smoke case always starts from the app's dark default.
    globalThis.localStorage.removeItem('jat.settings.v1');
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
    await changeControl(dates[1]!, toPlainDate(new Date()));
    await changeControl(dates[2]!, '2099-01-01');
    await clickButton('Add to calendar');

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
