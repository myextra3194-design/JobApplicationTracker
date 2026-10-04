import { StorageFullError, type FlashcardStore } from '../storage/adapter';
import { normalizeFlashcard, normalizeFlashcardList } from './cards';
import type { Flashcard } from './types';

export const FLASHCARDS_STORAGE_KEY = 'jat.flashcards.v1';

function corruptKeyFor(key: string): string {
  return `${key}.corrupt`;
}

interface FlashcardEnvelope {
  version: 1;
  savedAt: string;
  cards: Flashcard[];
}

function emptyEnvelope(): FlashcardEnvelope {
  return { version: 1, savedAt: '', cards: [] };
}

function readDocument(key: string): FlashcardEnvelope {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return emptyEnvelope();
  }
  if (!raw) return emptyEnvelope();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { version: 1, savedAt: '', cards: normalizeFlashcardList(parsed) };
    if (typeof parsed !== 'object' || parsed === null) return emptyEnvelope();
    const candidate = parsed as Record<string, unknown>;
    return {
      version: 1,
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : '',
      cards: normalizeFlashcardList(candidate.cards),
    };
  } catch {
    try {
      const quarantineKey = corruptKeyFor(key);
      if (globalThis.localStorage && globalThis.localStorage.getItem(quarantineKey) === null) {
        globalThis.localStorage.setItem(quarantineKey, raw);
      }
    } catch {
      // A blocked store cannot preserve the quarantine copy; still fail closed.
    }
    return emptyEnvelope();
  }
}

function writeDocument(key: string, cards: Flashcard[]): void {
  const document: FlashcardEnvelope = { version: 1, savedAt: new Date().toISOString(), cards };
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(document));
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    throw new StorageFullError(
      name === 'QuotaExceededError' ? 'the browser quota ran out while saving flashcards' : String(error),
    );
  }
}

function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function transaction<T>(work: () => T | Promise<T>): Promise<T> {
    const run = tail.then(work, work);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** Local-first study data; components use this seam rather than localStorage directly. */
export class LocalFlashcardStore implements FlashcardStore {
  private readonly transaction = createMutex();

  constructor(readonly storageKey: string = FLASHCARDS_STORAGE_KEY) {}

  async all(): Promise<Flashcard[]> {
    return this.transaction(() => readDocument(this.storageKey).cards);
  }

  async put(card: Flashcard): Promise<Flashcard> {
    const [saved] = await this.putMany([card]);
    if (!saved) throw new Error('The flashcard could not be saved.');
    return saved;
  }

  async putMany(cards: readonly Flashcard[]): Promise<Flashcard[]> {
    if (cards.length === 0) return [];
    return this.transaction(() => {
      const normalized = cards.map((card) => normalizeFlashcard(card));
      if (normalized.some((card) => card === null)) {
        throw new Error('Every flashcard needs both a prompt and an answer.');
      }
      const validCards = normalized as Flashcard[];
      const current = readDocument(this.storageKey).cards;
      const byId = new Map(current.map((card) => [card.id, card]));
      for (const card of validCards) byId.set(card.id, card);
      writeDocument(this.storageKey, [...byId.values()]);
      return validCards;
    });
  }

  async delete(id: string): Promise<void> {
    await this.transaction(() => {
      const next = readDocument(this.storageKey).cards.filter((card) => card.id !== id);
      writeDocument(this.storageKey, next);
    });
  }

  async clear(): Promise<void> {
    await this.transaction(() => {
      globalThis.localStorage?.removeItem(this.storageKey);
      globalThis.localStorage?.removeItem(corruptKeyFor(this.storageKey));
    });
  }
}
