import { describe, expect, it } from 'vitest';
import { parseFlashcardFileName, parseFlashcardText } from './import';

describe('flashcard source importer', () => {
  it('reads a front/back CSV with quoted commas as editable drafts', () => {
    expect(parseFlashcardText('front,back\n"What is Qatar, officially?","A sovereign country in the Gulf."')).toEqual([
      { front: 'What is Qatar, officially?', back: 'A sovereign country in the Gulf.' },
    ]);
  });

  it('reads Q/A blocks and simple separated pairs', () => {
    expect(parseFlashcardText('Q: What is retrieval practice?\nA: Actively recall information.\n\nSpaced practice :: Review over time.')).toEqual([
      { front: 'What is retrieval practice?', back: 'Actively recall information.' },
      { front: 'Spaced practice', back: 'Review over time.' },
    ]);
  });

  it('ignores malformed or empty rows and identifies the supported text formats', () => {
    expect(parseFlashcardText('front,back\nOnly one cell,\n,No prompt\n,')).toEqual([]);
    expect(parseFlashcardFileName('notes.TXT')).toBe(true);
    expect(parseFlashcardFileName('cards.csv')).toBe(true);
    expect(parseFlashcardFileName('photo.jpg')).toBe(false);
  });
});
