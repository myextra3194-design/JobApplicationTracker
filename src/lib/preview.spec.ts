import { describe, expect, it } from 'vitest';
import { previewText } from './preview';

describe('previewText', () => {
  it('returns "" for empty and whitespace-only input', () => {
    expect(previewText('')).toBe('');
    expect(previewText('   ')).toBe('');
    expect(previewText('\n\n   \t')).toBe('');
  });

  it('leaves text shorter than the limit unchanged', () => {
    expect(previewText('Short note')).toBe('Short note');
    expect(previewText('Note about the recruiter')).toBe('Note about the recruiter');
  });

  it('truncates longer text at a word boundary with "..."', () => {
    expect(previewText('The quick brown fox jumps over the lazy dog', 12)).toBe('The quick...');
  });

  it('cuts mid-word when the limit falls inside the first word', () => {
    expect(previewText('abcdefghijklmnop', 10)).toBe('abcdefghij...');
  });

  it('never returns an empty preview when the value starts with newlines', () => {
    expect(previewText('\n\nAlpha beta gamma delta', 12)).toBe('Alpha beta...');
    expect(previewText('\nShort but real')).toBe('Short but real');
  });
});
