import { describe, expect, it } from 'vitest';
import { emptyJobApplication } from './normalize';
import {
  addTag,
  applicationToDraft,
  draftToInput,
  emptyFormDraft,
  formHasErrors,
  removeTag,
  validateApplicationForm,
} from './form';

describe('emptyFormDraft', () => {
  it('defaults status to Saved and the two free-text fields to their empty defaults', () => {
    const draft = emptyFormDraft();
    expect(draft.status).toBe('Saved');
    expect(draft.interviewStatus).toBe('Not scheduled');
    expect(draft.finalResult).toBe('Pending');
    expect(draft.tags).toEqual([]);
    expect(draft.companyName).toBe('');
    expect(draft.jobTitle).toBe('');
  });
});

describe('validateApplicationForm', () => {
  it('requires companyName and jobTitle only', () => {
    expect(validateApplicationForm(emptyFormDraft())).toEqual({
      companyName: 'Company name is required.',
      jobTitle: 'Job title is required.',
    });
    expect(
      validateApplicationForm({ ...emptyFormDraft(), companyName: '  ', jobTitle: '\t' }),
    ).toEqual({
      companyName: 'Company name is required.',
      jobTitle: 'Job title is required.',
    });
    const ok = validateApplicationForm({
      ...emptyFormDraft(),
      companyName: 'Acme',
      jobTitle: 'Engineer',
    });
    expect(ok).toEqual({});
    expect(formHasErrors(ok)).toBe(false);
  });
});

describe('tag chips', () => {
  it('adds a trimmed tag, ignores blanks and case-insensitive duplicates, does not mutate', () => {
    const original = ['Remote'];
    expect(addTag(original, '  Referral  ')).toEqual(['Remote', 'Referral']);
    expect(original).toEqual(['Remote']);
    expect(addTag(original, '   ')).toEqual(['Remote']);
    expect(addTag(original, 'remote')).toEqual(['Remote']);
  });

  it('removes by exact spelling and no-ops when missing', () => {
    expect(removeTag(['Remote', 'Referral'], 'Remote')).toEqual(['Referral']);
    expect(removeTag(['Remote'], 'nope')).toEqual(['Remote']);
  });
});

describe('draft <-> record', () => {
  it('round-trips dates, tags, extras; blank dates and scores become null', () => {
    const app = emptyJobApplication({
      companyName: 'Acme',
      jobTitle: 'Engineer',
      applicationDate: '2026-08-01',
      followUpDate: null,
      interviewDate: '2026-08-20',
      tags: ['Remote'],
      companyResearch: 'Series B, 40 people',
      matchScore: 71,
      cvVersionUsed: 'CV_QATAR_UTILITY',
      jobLink: 'https://example.com/job',
    });
    const draft = applicationToDraft(app);
    expect(draft.applicationDate).toBe('2026-08-01');
    expect(draft.followUpDate).toBe('');
    expect(draft.matchScore).toBe('71');
    expect(draft.cvVersionUsed).toBe('CV_QATAR_UTILITY');
    expect(draft.companyResearch).toBe('Series B, 40 people');
    expect(draft.tags).toEqual(['Remote']);
    expect(draft.tags).not.toBe(app.tags);

    const input = draftToInput({ ...draft, followUpDate: '', matchScore: '', cvVersionUsed: '' });
    expect(input.followUpDate).toBeNull();
    expect(input.matchScore).toBeNull();
    expect(input.cvVersionUsed).toBeNull();
    expect(input.applicationDate).toBe('2026-08-01');
    expect(input.jobLink).toBe('https://example.com/job');
  });
});
