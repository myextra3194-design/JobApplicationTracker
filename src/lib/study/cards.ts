import { DEFAULT_FLASHCARD_DECK, type Flashcard } from './types';

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `fc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function validIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100_000, Math.max(0, Math.floor(value))) : 0;
}

/** Create a new, immediately-due flashcard. Content is trimmed, never sent off-device. */
export function createFlashcard(
  front: string,
  back: string,
  deck = DEFAULT_FLASHCARD_DECK,
  now = new Date(),
): Flashcard {
  const cleanFront = front.trim();
  const cleanBack = back.trim();
  if (!cleanFront || !cleanBack) throw new Error('Both the prompt and answer are required.');

  const stamp = now.toISOString();
  return {
    id: newId(),
    deck: deck.trim() || DEFAULT_FLASHCARD_DECK,
    front: cleanFront,
    back: cleanBack,
    createdAt: stamp,
    updatedAt: stamp,
    dueAt: stamp,
    lastReviewedAt: null,
    intervalDays: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
  };
}

/** Normalize persisted or imported data before it reaches the UI. */
export function normalizeFlashcard(value: unknown, now = new Date()): Flashcard | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const front = typeof candidate.front === 'string' ? candidate.front.trim() : '';
  const back = typeof candidate.back === 'string' ? candidate.back.trim() : '';
  if (!front || !back) return null;

  const stamp = now.toISOString();
  const lastReviewedAt =
    typeof candidate.lastReviewedAt === 'string' && Number.isFinite(Date.parse(candidate.lastReviewedAt))
      ? new Date(candidate.lastReviewedAt).toISOString()
      : null;

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : newId(),
    deck:
      typeof candidate.deck === 'string' && candidate.deck.trim()
        ? candidate.deck.trim().slice(0, 120)
        : DEFAULT_FLASHCARD_DECK,
    front: front.slice(0, 10_000),
    back: back.slice(0, 20_000),
    createdAt: validIsoDate(candidate.createdAt, stamp),
    updatedAt: validIsoDate(candidate.updatedAt, stamp),
    dueAt: validIsoDate(candidate.dueAt, stamp),
    lastReviewedAt,
    intervalDays: boundedNumber(candidate.intervalDays, 0, 0, 36_500),
    easeFactor: boundedNumber(candidate.easeFactor, 2.5, 1.3, 3),
    repetitions: nonNegativeInteger(candidate.repetitions),
    lapses: nonNegativeInteger(candidate.lapses),
  };
}

export function normalizeFlashcardList(value: unknown): Flashcard[] {
  if (!Array.isArray(value)) return [];
  const now = new Date();
  const seen = new Set<string>();
  const cards: Flashcard[] = [];
  for (const item of value) {
    const card = normalizeFlashcard(item, now);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }
  return cards;
}
