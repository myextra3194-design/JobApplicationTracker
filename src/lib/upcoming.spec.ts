import { describe, expect, it } from 'vitest';
import { emptyJobApplication } from './normalize';
import { dueFollowUps, upcomingInterviews } from './upcoming';

/** Fixed local reference date: Sat 29 Aug 2026 — same fixture as pipeline.spec. */
const TODAY = new Date(2026, 7, 29);

describe('dueFollowUps', () => {
  it('includes today and past follow-ups while in progress, soonest first', () => {
    const yesterday = emptyJobApplication({
      id: 'yesterday',
      status: 'Applied',
      followUpDate: '2026-08-28',
      companyName: 'Acme',
    });
    const today = emptyJobApplication({
      id: 'today',
      status: 'Shortlisted',
      followUpDate: '2026-08-29',
      companyName: 'Globex',
    });
    const tomorrow = emptyJobApplication({
      id: 'tomorrow',
      status: 'Interview',
      followUpDate: '2026-08-30',
      companyName: 'Initech',
    });
    const lastWeek = emptyJobApplication({
      id: 'last-week',
      status: 'Applied',
      followUpDate: '2026-08-20',
      companyName: 'Umbrella',
    });

    expect(dueFollowUps([tomorrow, today, yesterday, lastWeek], TODAY).map((r) => r.id)).toEqual([
      'last-week',
      'yesterday',
      'today',
    ]);
  });

  it('excludes Rejected, Withdrawn, Offer, Saved, and rows with no date', () => {
    const records = [
      emptyJobApplication({ id: 'rejected', status: 'Rejected', followUpDate: '2026-08-20' }),
      emptyJobApplication({ id: 'withdrawn', status: 'Withdrawn', followUpDate: '2026-08-20' }),
      emptyJobApplication({ id: 'offer', status: 'Offer', followUpDate: '2026-08-20' }),
      emptyJobApplication({ id: 'saved', status: 'Saved', followUpDate: '2026-08-20' }),
      emptyJobApplication({ id: 'no-date', status: 'Applied', followUpDate: null }),
      emptyJobApplication({ id: 'applied', status: 'Applied', followUpDate: '2026-08-20' }),
    ];
    expect(dueFollowUps(records, TODAY).map((r) => r.id)).toEqual(['applied']);
  });

  it('excludes archived and deleted rows', () => {
    const live = emptyJobApplication({
      id: 'live',
      status: 'Interview',
      followUpDate: '2026-08-20',
    });
    const archived = emptyJobApplication({
      id: 'archived',
      status: 'Interview',
      followUpDate: '2026-08-20',
      isArchived: true,
    });
    const deleted = emptyJobApplication({
      id: 'deleted',
      status: 'Interview',
      followUpDate: '2026-08-20',
      deletedAt: '2026-08-21T00:00:00.000Z',
    });
    expect(dueFollowUps([live, archived, deleted], TODAY).map((r) => r.id)).toEqual(['live']);
  });
});

describe('upcomingInterviews', () => {
  it('includes only strictly-future interview dates, soonest first', () => {
    const yesterday = emptyJobApplication({
      id: 'yesterday',
      interviewDate: '2026-08-28',
      companyName: 'Past Co',
    });
    const today = emptyJobApplication({
      id: 'today',
      interviewDate: '2026-08-29',
      companyName: 'Today Co',
    });
    const tomorrow = emptyJobApplication({
      id: 'tomorrow',
      interviewDate: '2026-08-30',
      companyName: 'Acme',
      jobTitle: 'Engineer',
      interviewStatus: 'Scheduled',
    });
    const nextWeek = emptyJobApplication({
      id: 'next-week',
      interviewDate: '2026-09-04',
      companyName: 'Globex',
    });
    const noDate = emptyJobApplication({ id: 'no-date', interviewDate: null });

    expect(upcomingInterviews([nextWeek, yesterday, tomorrow, today, noDate], TODAY).map((r) => r.id)).toEqual([
      'tomorrow',
      'next-week',
    ]);
  });

  it('excludes archived and deleted rows even when the interview is in the future', () => {
    const live = emptyJobApplication({ id: 'live', interviewDate: '2026-09-01' });
    const archived = emptyJobApplication({
      id: 'archived',
      interviewDate: '2026-09-01',
      isArchived: true,
    });
    const deleted = emptyJobApplication({
      id: 'deleted',
      interviewDate: '2026-09-01',
      deletedAt: '2026-08-21T00:00:00.000Z',
    });
    expect(upcomingInterviews([live, archived, deleted], TODAY).map((r) => r.id)).toEqual(['live']);
  });
});
