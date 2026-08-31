import { describe, expect, it } from 'vitest';
import { emptyJobApplication } from './normalize';
import {
  addTag,
  applicationToDraft,
  commitPendingTag,
  draftToInput,
  emptyFormDraft,
  finalResultIsFilled,
  formHasErrors,
  needsFinalResultNudge,
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

  it('rejects a match score outside 0-100 or not numeric, instead of silently clamping it', () => {
    // The normaliser would clamp these to 100/0 — the form must say no instead
    // of saving a different number from the one the user typed.
    for (const bad of ['250', '-5', '1e3', '12.5.5', 'abc']) {
      const errors = validateApplicationForm({
        ...emptyFormDraft(),
        companyName: 'Acme',
        jobTitle: 'Engineer',
        matchScore: bad,
      });
      expect(errors.matchScore, `matchScore ${bad} should be rejected`).toBeDefined();
      expect(formHasErrors(errors)).toBe(true);
    }

    // Blank (not scored), the boundaries and decimals inside the range pass.
    for (const good of ['', '  ', '0', '100', '71', '71.5']) {
      const errors = validateApplicationForm({
        ...emptyFormDraft(),
        companyName: 'Acme',
        jobTitle: 'Engineer',
        matchScore: good,
      });
      expect(errors.matchScore, `matchScore ${good} should be accepted`).toBeUndefined();
      expect(formHasErrors(errors)).toBe(false);
    }
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

  it('commitPendingTag keeps a typed-but-uncommitted tag from being dropped by the submit', () => {
    const draft = emptyFormDraft();
    // A tag typed into the input with no Enter press joins the draft on submit.
    const committed = commitPendingTag(draft, '  Referral  ');
    expect(committed.tags).toEqual(['Referral']);
    expect(committed).not.toBe(draft);

    // Blank and duplicate pending tags return the SAME draft object, so the
    // form can skip a pointless state write.
    expect(commitPendingTag(draft, '   ')).toBe(draft);
    expect(commitPendingTag(draft, '')).toBe(draft);
    const tagged = { ...draft, tags: ['Referral'] };
    expect(commitPendingTag(tagged, 'referral')).toBe(tagged);
    // The input draft is never mutated.
    expect(draft.tags).toEqual([]);
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

describe('Part 5: draft.files is form state, never record input', () => {
  it('defaults to an empty list and stays out of emptyFormDraft equality surprises', () => {
    expect(emptyFormDraft().files).toEqual([]);
    expect(emptyFormDraft().files).not.toBe(emptyFormDraft().files); // fresh array each call
  });

  it('is dropped by draftToInput, so a record can never reference a file', () => {
    const draft = { ...emptyFormDraft(), companyName: 'Acme', jobTitle: 'Engineer' };
    draft.files = [
      { key: 'k1', label: 'Resume', file: { name: 'cv.pdf', size: 12 } as unknown as File },
    ];
    const input = draftToInput(draft);
    expect(Object.keys(input)).not.toContain('files');
    expect(Object.keys(input)).not.toContain('attachmentIds');
    // Everything else still round-trips.
    expect(input.companyName).toBe('Acme');
    expect(input.status).toBe('Saved');
  });

  it('is not read back from a record — existing files come from the attachment store', () => {
    const app = emptyJobApplication({ companyName: 'Acme', jobTitle: 'Engineer' });
    expect(applicationToDraft(app).files).toEqual([]);
  });
});

describe('Part 6: final-result nudge rule', () => {
  it('treats blank and the Pending default as "not filled in", any casing', () => {
    expect(finalResultIsFilled('')).toBe(false);
    expect(finalResultIsFilled('   ')).toBe(false);
    expect(finalResultIsFilled('Pending')).toBe(false);
    expect(finalResultIsFilled(' pending ')).toBe(false);
    expect(finalResultIsFilled('Hired')).toBe(true);
    expect(finalResultIsFilled('ghosted')).toBe(true);
    expect(finalResultIsFilled('Withdrew after offer')).toBe(true);
  });

  it('nudges only Rejected/Withdrawn while the final result is not filled in', () => {
    expect(needsFinalResultNudge('Rejected', 'Pending')).toBe(true);
    expect(needsFinalResultNudge('Withdrawn', '')).toBe(true);
    expect(needsFinalResultNudge('Rejected', 'Hired')).toBe(false);
    expect(needsFinalResultNudge('Withdrawn', 'Withdrew after offer')).toBe(false);
    expect(needsFinalResultNudge('Offer', 'Pending')).toBe(false);
    expect(needsFinalResultNudge('Applied', 'Pending')).toBe(false);
  });
});
