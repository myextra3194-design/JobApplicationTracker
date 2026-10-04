import { describe, expect, it } from 'vitest';
import { createFlashcard } from './cards';
import { dueFlashcards, formatDueAt, formatInterval, planReview, rateFlashcard } from './schedule';

describe('flashcard spaced-repetition schedule', () => {
  const now = new Date('2026-10-04T12:00:00.000Z');

  it('starts new cards due immediately and increases successful review intervals adaptively', () => {
    const card = createFlashcard('What is active recall?', 'Retrieve an answer from memory.', 'Learning', now);
    expect(card.dueAt).toBe(now.toISOString());

    const firstGood = rateFlashcard(card, 'good', now);
    expect(firstGood.intervalDays).toBe(1);
    expect(firstGood.repetitions).toBe(1);
    expect(firstGood.dueAt).toBe('2026-10-05T12:00:00.000Z');

    const secondGood = rateFlashcard(firstGood, 'good', now);
    expect(secondGood.intervalDays).toBe(6);
    expect(secondGood.repetitions).toBe(2);

    const easy = rateFlashcard(secondGood, 'easy', now);
    expect(easy.intervalDays).toBe(16.8);
    expect(easy.easeFactor).toBe(2.65);
  });

  it('schedules Again in ten minutes, resets repetitions, and records a lapse', () => {
    const card = { ...createFlashcard('Prompt', 'Answer', 'General', now), repetitions: 3, intervalDays: 8 };
    const again = rateFlashcard(card, 'again', now);
    expect(again.dueAt).toBe('2026-10-04T12:10:00.000Z');
    expect(again.intervalDays).toBe(0);
    expect(again.repetitions).toBe(0);
    expect(again.lapses).toBe(1);
    expect(again.easeFactor).toBe(2.3);
  });

  it('uses the active recall rating names and reports practical intervals', () => {
    const card = createFlashcard('Prompt', 'Answer', 'General', now);
    expect(formatInterval(planReview(card, 'again').delayMs)).toBe('10 min');
    expect(formatInterval(planReview(card, 'hard').delayMs)).toBe('1 day');
    expect(formatInterval(planReview(card, 'easy').delayMs)).toBe('4 days');
    expect(formatDueAt('2026-10-04T12:01:00.000Z', now)).toBe('In 1 min');
    expect(formatDueAt('2026-10-04T11:59:00.000Z', now)).toBe('Due now');
  });

  it('returns only due cards, earliest first', () => {
    const later = { ...createFlashcard('Later', 'B', 'General', now), dueAt: '2026-10-05T12:00:00.000Z' };
    const earlier = { ...createFlashcard('Earlier', 'A', 'General', now), dueAt: '2026-10-03T12:00:00.000Z' };
    expect(dueFlashcards([later, earlier], now).map((card) => card.front)).toEqual(['Earlier']);
  });
});
