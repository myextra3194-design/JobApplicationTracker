// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createFlashcard } from './cards';
import { FLASHCARDS_STORAGE_KEY, LocalFlashcardStore } from './store';

describe('local flashcard storage seam', () => {
  let store: LocalFlashcardStore;

  beforeEach(async () => {
    localStorage.clear();
    store = new LocalFlashcardStore();
  });

  it('persists, updates, deletes, and writes a batch atomically', async () => {
    const first = createFlashcard('Prompt one', 'Answer one', 'Biology', new Date('2026-10-04T12:00:00.000Z'));
    const second = createFlashcard('Prompt two', 'Answer two', 'Biology', new Date('2026-10-04T12:00:00.000Z'));
    await store.putMany([first, second]);
    expect((await store.all()).map((card) => card.front)).toEqual(['Prompt one', 'Prompt two']);

    await store.put({ ...first, front: 'Edited prompt' });
    expect((await store.all()).find((card) => card.id === first.id)?.front).toBe('Edited prompt');
    await store.delete(second.id);
    expect((await store.all()).map((card) => card.id)).toEqual([first.id]);
  });

  it('normalizes unknown data and preserves corrupt JSON in a quarantine key', async () => {
    localStorage.setItem(FLASHCARDS_STORAGE_KEY, '{not json');
    expect(await store.all()).toEqual([]);
    expect(localStorage.getItem(`${FLASHCARDS_STORAGE_KEY}.corrupt`)).toBe('{not json');

    localStorage.setItem(
      FLASHCARDS_STORAGE_KEY,
      JSON.stringify({ cards: [{ id: 'valid', front: '  Prompt ', back: ' Answer ', dueAt: 'bad date' }] }),
    );
    const cards = await store.all();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.front).toBe('Prompt');
    expect(Date.parse(cards[0]!.dueAt)).not.toBeNaN();
  });
});
