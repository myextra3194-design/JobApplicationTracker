/**
 * Part 6: read-mode previews for Notes and Company Research in the list view.
 *
 * Pure so the list cannot drift from what the tests assert. The preview is the
 * first non-blank line (a leading newline is the common way a note starts and
 * must not hide the whole row), trimmed, and truncated at a word boundary with
 * "..." when it is longer than `limit`.
 */

export const PREVIEW_LIMIT = 60;

export function previewText(value: string, limit = PREVIEW_LIMIT): string {
  const firstLine = value.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  const text = firstLine.trim();
  if (!text) return '';
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  // No space in the window: cut mid-word rather than invent one.
  const boundary = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${boundary.replace(/\s+$/, '')}...`;
}
