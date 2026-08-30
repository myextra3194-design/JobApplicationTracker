import { describe, expect, it } from 'vitest';
import { duplicateKey, findDuplicates } from './duplicates';
import { emptyJobApplication } from './normalize';

describe('duplicateKey', () => {
  it('builds one identity from company + title, case-insensitive and trimmed', () => {
    expect(duplicateKey('  Acme ', 'Engineer')).toBe(duplicateKey('acme', 'ENGINEER'));
    expect(duplicateKey('Acme', 'Engineer')).toBe('acme\u0000engineer');
  });

  it('has no identity when either side is blank', () => {
    expect(duplicateKey('', 'Engineer')).toBe('');
    expect(duplicateKey('Acme', '   ')).toBe('');
    expect(duplicateKey('  ', 'Engineer')).toBe('');
  });
});

describe('findDuplicates', () => {
  const records = [
    emptyJobApplication({ id: 'one', companyName: 'Acme', jobTitle: 'Engineer' }),
    emptyJobApplication({ id: 'two', companyName: '  acme ', jobTitle: '  ENGINEER' }),
    emptyJobApplication({ id: 'three', companyName: 'Acme', jobTitle: 'Designer' }),
    emptyJobApplication({ id: 'archived', companyName: 'Acme', jobTitle: 'Engineer', isArchived: true }),
    emptyJobApplication({
      id: 'deleted',
      companyName: 'Acme',
      jobTitle: 'Engineer',
      deletedAt: '2026-08-01T00:00:00.000Z',
    }),
  ];

  it('finds the same role ignoring case and whitespace', () => {
    const found = findDuplicates(records, { companyName: 'ACME', jobTitle: 'engineer' });
    expect(found.map((r) => r.id).sort()).toEqual(['one', 'two']);
  });

  it('excludes archived and deleted rows from the "already applied" claim', () => {
    const found = findDuplicates(records, { companyName: 'Acme', jobTitle: 'Engineer' });
    expect(found.map((r) => r.id)).not.toContain('archived');
    expect(found.map((r) => r.id)).not.toContain('deleted');
    expect(found.map((r) => r.id).sort()).toEqual(['one', 'two']);
  });

  it('never reports the record being edited as a duplicate of itself', () => {
    const found = findDuplicates(records, { companyName: 'acme', jobTitle: 'ENGINEER' }, 'one');
    expect(found.map((r) => r.id)).toEqual(['two']);
  });

  it('returns nothing for a blank candidate or a role nobody holds', () => {
    expect(findDuplicates(records, { companyName: '', jobTitle: '' })).toEqual([]);
    expect(findDuplicates(records, { companyName: '  ', jobTitle: 'Engineer' })).toEqual([]);
    expect(findDuplicates(records, { companyName: 'Globex', jobTitle: 'Engineer' })).toEqual([]);
  });
});
