import type { Flashcard, FlashcardRating } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const AGAIN_DELAY_MS = 10 * 60 * 1000;

export interface ReviewPlan {
  delayMs: number;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
}

function roundInterval(days: number): number {
  return Math.max(1, Math.round(days * 10) / 10);
}

/** Simplified adaptive SM-2 schedule, with an explicit ten-minute Again retry. */
export function planReview(card: Flashcard, rating: FlashcardRating): ReviewPlan {
  const ease = card.easeFactor;
  if (rating === 'again') {
    return {
      delayMs: AGAIN_DELAY_MS,
      intervalDays: 0,
      easeFactor: Math.max(1.3, Math.round((ease - 0.2) * 100) / 100),
      repetitions: 0,
      lapses: card.lapses + 1,
    };
  }

  if (rating === 'hard') {
    const intervalDays = card.repetitions === 0 ? 1 : roundInterval(card.intervalDays * 1.2);
    return {
      delayMs: intervalDays * DAY_MS,
      intervalDays,
      easeFactor: Math.max(1.3, Math.round((ease - 0.15) * 100) / 100),
      repetitions: card.repetitions + 1,
      lapses: card.lapses,
    };
  }

  if (rating === 'good') {
    const intervalDays = card.repetitions === 0 ? 1 : card.repetitions === 1 ? 6 : roundInterval(card.intervalDays * ease);
    return {
      delayMs: intervalDays * DAY_MS,
      intervalDays,
      easeFactor: ease,
      repetitions: card.repetitions + 1,
      lapses: card.lapses,
    };
  }

  const intervalDays = card.repetitions === 0 ? 4 : card.repetitions === 1 ? 7 : roundInterval(card.intervalDays * (ease + 0.3));
  return {
    delayMs: intervalDays * DAY_MS,
    intervalDays,
    easeFactor: Math.min(3, Math.round((ease + 0.15) * 100) / 100),
    repetitions: card.repetitions + 1,
    lapses: card.lapses,
  };
}

export function rateFlashcard(card: Flashcard, rating: FlashcardRating, now = new Date()): Flashcard {
  const plan = planReview(card, rating);
  const stamp = now.toISOString();
  return {
    ...card,
    updatedAt: stamp,
    lastReviewedAt: stamp,
    dueAt: new Date(now.getTime() + plan.delayMs).toISOString(),
    intervalDays: plan.intervalDays,
    easeFactor: plan.easeFactor,
    repetitions: plan.repetitions,
    lapses: plan.lapses,
  };
}

export function formatInterval(delayMs: number): string {
  const minutes = Math.max(1, Math.round(delayMs / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = delayMs / (60 * 60 * 1000);
  if (hours < 24) return `${Math.max(1, Math.round(hours))} hr`;
  const days = delayMs / DAY_MS;
  const roundedDays = Math.round(days * 10) / 10;
  return `${roundedDays} ${roundedDays === 1 ? 'day' : 'days'}`;
}

export function formatDueAt(dueAt: string, now = new Date()): string {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due) || due <= now.getTime()) return 'Due now';
  const delay = due - now.getTime();
  if (delay < 60 * 60 * 1000) return `In ${Math.max(1, Math.ceil(delay / 60_000))} min`;
  if (delay < DAY_MS) return `In ${Math.ceil(delay / (60 * 60 * 1000))} hr`;
  const days = Math.ceil(delay / DAY_MS);
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

export function dueFlashcards(cards: readonly Flashcard[], now = new Date()): Flashcard[] {
  const timestamp = now.getTime();
  return cards
    .filter((card) => Date.parse(card.dueAt) <= timestamp)
    .slice()
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.createdAt.localeCompare(b.createdAt));
}
