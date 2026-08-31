import { describe, expect, it } from 'vitest';
import { KeyJournal, type JournalStorage } from './journal';

function fakeStorage(): JournalStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => void raw.set(key, value),
    removeItem: (key) => void raw.delete(key),
  };
}

describe('KeyJournal', () => {
  it('starts empty and remembers marked keys across instances', () => {
    const storage = fakeStorage();
    const first = new KeyJournal('test.journal', storage);
    expect(first.has('a')).toBe(false);
    expect(first.keys().size).toBe(0);

    first.mark(['a', 'b']);
    const second = new KeyJournal('test.journal', storage);
    expect(second.keys()).toEqual(new Set(['a', 'b']));
    expect(second.has('a')).toBe(true);
  });

  it('merges keys, ignores blanks, and dedupes', () => {
    const storage = fakeStorage();
    const journal = new KeyJournal('test.journal', storage);
    journal.mark(['a', 'b']);
    journal.mark(['b', 'c', '']);
    expect(journal.keys()).toEqual(new Set(['a', 'b', 'c']));
  });

  it('caps the document at the newest 300 keys', () => {
    const storage = fakeStorage();
    const journal = new KeyJournal('test.journal', storage);
    const first = Array.from({ length: 250 }, (_, i) => `old-${i}`);
    const second = Array.from({ length: 100 }, (_, i) => `new-${i}`);
    journal.mark(first);
    journal.mark(second);
    const keys = journal.keys();
    expect(keys.size).toBe(300);
    expect(keys.has('new-99')).toBe(true);
    expect(keys.has('old-0')).toBe(false); // dropped off the front
  });

  it('tolerates corrupt documents and a missing localStorage', () => {
    const corrupt = fakeStorage();
    corrupt.setItem('test.journal', '{not json');
    expect(new KeyJournal('test.journal', corrupt).keys().size).toBe(0);

    const noStorage = new KeyJournal('test.journal', null);
    expect(noStorage.has('a')).toBe(false);
    expect(() => {
      noStorage.mark(['a']);
      noStorage.clear();
    }).not.toThrow();
  });
});
