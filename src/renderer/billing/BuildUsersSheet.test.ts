import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildUsersSheetRows, buildUsersSummaryRows, buildUsersWorkbook, maskEmail } from './BuildUsersSheet';
import type { BuildInsightUser } from './BuildAdminService';
import { isPawosFounderEmail } from '../../shared/admin/AdminEmails';

const NOW = Date.parse('2026-09-25T12:00:00Z');

function user(email: string, extra: Partial<BuildInsightUser> = {}): BuildInsightUser {
  return {
    id: email,
    email,
    userId: 'u-' + email,
    cohortId: 'build-2026',
    status: 'active',
    startsAt: '2026-09-20T00:00:00Z',
    endsAt: '2026-11-20T00:00:00Z',
    revokedAt: null,
    grantedByEmail: 'supabase-sql-editor',
    notes: null,
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    signedIn: true,
    usage: { report: { weekPcUsed: 120.456, weekPcLimit: 1500, weekHoursUsed: 3.2, weekHoursLimit: 15, fileChangesUsed: 40, fileChangesCap: 155 }, reportedAt: '2026-09-25T10:00:00Z' },
    ratings: { count: 2, average: 4.5, items: [] },
    reports: { count: 1, items: [] },
    purchases: { count: 1, totalUsd: 9.99, items: [] },
    ...extra,
  };
}

describe('Build users sheet (download)', () => {
  it('masks emails as the first two letters, ****, then the domain', () => {
    expect(maskEmail('ghost.rider@gmail.com')).toBe('gh****@gmail.com');
    expect(maskEmail('ab@college.edu')).toBe('a****@college.edu');
    expect(maskEmail('x@y.io')).toBe('x****@y.io');
    expect(maskEmail('not-an-email')).toBe('****');
  });

  it('never puts a full email or the hidden file limit in the sheet', () => {
    const users = [user('ghost.rider@gmail.com'), user('student.two@college.edu', { usage: null, purchases: null })];
    const rows = buildUsersSheetRows(users, NOW);
    expect(rows.map((r) => r.Email)).toEqual(['gh****@gmail.com', 'st****@college.edu']);

    const bytes = buildUsersWorkbook(users, NOW);
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Summary', 'Build users']);
    const text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
    expect(text).not.toContain('ghost.rider@');
    expect(text).not.toContain('student.two@');
    expect(text).not.toMatch(/\bfiles?\b/i); // the hidden file limit never leaves the panel
    expect(text).toContain('gh****@gmail.com');
  });

  it('fills usage, ratings, reports and purchases per student', () => {
    const [row] = buildUsersSheetRows([user('ghost.rider@gmail.com')], NOW);
    expect(row).toMatchObject({ 'PC used this week': 120.46, 'PC weekly limit': 1500, 'Average rating': 4.5, Ratings: 2, Reports: 1, 'Credit purchases': 1, 'Credits bought (USD)': 9.99, 'Days left': 56 });
  });

  it('summarises how many students were granted, active and actually using PawOS', () => {
    const users = [user('a1@x.com'), user('b1@x.com', { status: 'expired', usage: null, signedIn: false, ratings: { count: 0, average: null, items: [] } })];
    const summary = Object.fromEntries(buildUsersSummaryRows(users, NOW).map((r) => [r.Metric, r.Value]));
    expect(summary).toMatchObject({ 'Build students granted': 2, 'Active now': 1, 'Signed in to PawOS': 1, 'Using PawOS (usage reported)': 1, 'Average rating': 4.5 });
  });

  it('only the founder account can lift screen-capture protection', () => {
    expect(isPawosFounderEmail(' Founder@RevantaAI.com')).toBe(true);
    expect(isPawosFounderEmail('pawos@revantaai.com')).toBe(false);
    expect(isPawosFounderEmail('tharun@revantaai.com')).toBe(false);
    expect(isPawosFounderEmail(null)).toBe(false);
  });
});
