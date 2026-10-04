export const DEFAULT_FLASHCARD_DECK = 'General';

export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';

/** A browser-local study prompt with an adaptive next-review date. */
export interface Flashcard {
  id: string;
  deck: string;
  front: string;
  back: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  lastReviewedAt: string | null;
  /** The previous successful interval in days. Again uses a ten-minute retry instead. */
  intervalDays: number;
  /** Simplified SM-2 ease factor, bounded so schedules cannot collapse. */
  easeFactor: number;
  repetitions: number;
  lapses: number;
}

export interface FlashcardDraft {
  front: string;
  back: string;
}
