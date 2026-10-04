import type { FlashcardDraft } from './types';

type Delimiter = ',' | '\t' | ';';

function splitDelimitedLine(line: string, delimiter: Delimiter): string[] {
  const cells: string[] = [];
  let value = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === delimiter && !inQuotes) {
      cells.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function headerColumns(line: string): { delimiter: Delimiter; front: number; back: number } | null {
  for (const delimiter of [',', '\t', ';'] as const) {
    const cells = splitDelimitedLine(line, delimiter).map((cell) => cell.toLowerCase().replace(/^\uFEFF/, ''));
    if (cells.length < 2) continue;
    const front = cells.findIndex((cell) => ['front', 'question', 'prompt', 'term'].includes(cell));
    const back = cells.findIndex((cell) => ['back', 'answer', 'definition', 'response'].includes(cell));
    if (front >= 0 && back >= 0 && front !== back) return { delimiter, front, back };
  }
  return null;
}

function cleanCell(value: string): string {
  return value.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
}

function delimitedPair(line: string): FlashcardDraft | null {
  const separators = ['::', '\t', ' | ', ' — ', ' – ', ' - '];
  for (const separator of separators) {
    const index = line.indexOf(separator);
    if (index < 0) continue;
    const front = cleanCell(line.slice(0, index));
    const back = cleanCell(line.slice(index + separator.length));
    if (front && back) return { front, back };
  }
  return null;
}

/**
 * Parse safe, local Q/A text formats into editable drafts. PDF/Office/photo OCR is
 * intentionally not faked here; it needs a separately chosen multimodal agent.
 */
export function parseFlashcardText(source: string): FlashcardDraft[] {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const lines = text.split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0) return [];

  const columns = headerColumns(lines[firstContentIndex]!.trim());
  if (columns) {
    return lines
      .slice(firstContentIndex + 1)
      .filter((line) => line.trim().length > 0)
      .map((line) => splitDelimitedLine(line, columns.delimiter))
      .map((cells) => ({
        front: cleanCell(cells[columns.front] ?? ''),
        back: cleanCell(cells[columns.back] ?? ''),
      }))
      .filter((draft) => draft.front.length > 0 && draft.back.length > 0);
  }

  const drafts: FlashcardDraft[] = [];
  for (let index = firstContentIndex; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    const inline = line.match(/^(?:q|question)\s*:\s*(.*?)\s+a(?:nswer)?\s*:\s*(.+)$/i);
    if (inline?.[1] && inline[2]) {
      drafts.push({ front: cleanCell(inline[1]), back: cleanCell(inline[2]) });
      continue;
    }

    const question = line.match(/^(?:q|question)\s*[:.)]\s*(.+)$/i);
    if (question?.[1]) {
      let answerIndex = index + 1;
      while (answerIndex < lines.length && !lines[answerIndex]!.trim()) answerIndex += 1;
      const answer = lines[answerIndex]?.trim().match(/^(?:a|answer)\s*[:.)]\s*(.+)$/i);
      if (answer?.[1]) {
        drafts.push({ front: cleanCell(question[1]), back: cleanCell(answer[1]) });
        index = answerIndex;
        continue;
      }
    }

    const pair = delimitedPair(line);
    if (pair) drafts.push(pair);
  }
  return drafts;
}

export function parseFlashcardFileName(name: string): boolean {
  return /\.(txt|csv|tsv|md)$/i.test(name);
}
