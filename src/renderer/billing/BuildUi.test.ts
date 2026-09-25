import { describe, expect, it } from 'vitest';
import { describeBuildAccess, formatTierLabel } from './EntitlementDisplay';
import { getExhaustionPrimaryActions } from '../ui/billing/CreditsRequiredNotice';
import { describeLaunchFailure } from '../conversation/LaunchReadinessUX';
import { getDefaultModelForTier, getAvailableModelsForTier } from '../ai/ModelSelectionByTier';
import { jobSearchLinks, resumeToPdfDocument } from '../../shared/career/CareerPdf';
import type { EntitlementSnapshot, BuildAccessState } from '../../shared/billing/BillingTypes';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-01T12:00:00Z');

function snapshot(tier: EntitlementSnapshot['tier'], buildAccess: BuildAccessState | null): EntitlementSnapshot {
  return { tier, baseTier: 'go', buildAccess } as EntitlementSnapshot;
}

function access(status: BuildAccessState['status'], endsAt: number | null, extra: Partial<BuildAccessState> = {}): BuildAccessState {
  return { status, cohortId: 'build-2026', startsAt: endsAt === null ? null : endsAt - 56 * DAY, endsAt, revokedAt: null, syncedAt: NOW, ...extra };
}

describe('PawOS Build UI identity', () => {
  it('labels Build as "PawOS Build", never as Go', () => {
    expect(formatTierLabel('build')).toBe('PawOS Build');
    expect(formatTierLabel('go')).toBe('Paw Go');
  });

  it('describes active access with days left, warning only in the last 7 days', () => {
    const plenty = describeBuildAccess(snapshot('build', access('active', NOW + 30 * DAY)), NOW);
    expect(plenty).toMatchObject({ kind: 'active', daysLeft: 30, expiringSoon: false });
    const soon = describeBuildAccess(snapshot('build', access('active', NOW + 3 * DAY)), NOW);
    expect(soon).toMatchObject({ kind: 'active', daysLeft: 3, expiringSoon: true });
  });

  it('shows expired once the effective tier has fallen back, even if the cached server status still says active', () => {
    // Main process already resolved the effective tier back to Go (endsAt passed) — the UI follows it.
    expect(describeBuildAccess(snapshot('go', access('active', NOW - 1000)), NOW)).toEqual({ kind: 'expired', endsAt: NOW - 1000 });
    expect(describeBuildAccess(snapshot('go', access('expired', NOW - DAY)), NOW)).toEqual({ kind: 'expired', endsAt: NOW - DAY });
  });

  it('shows revoked and none states', () => {
    expect(describeBuildAccess(snapshot('go', access('revoked', NOW + DAY, { revokedAt: NOW })), NOW)).toEqual({ kind: 'revoked', revokedAt: NOW });
    expect(describeBuildAccess(snapshot('go', null), NOW)).toEqual({ kind: 'none' });
    expect(describeBuildAccess(null, NOW)).toEqual({ kind: 'none' });
  });

  it('Build limit reached: Buy only in weeks 1–7; Upgrade to Pro only (no Buy) in the final week', () => {
    expect(getExhaustionPrimaryActions('build', undefined, false, true)).toEqual([{ id: 'buyCompute', label: 'Buy Paw Compute' }]);
    expect(getExhaustionPrimaryActions('build', undefined, false, true, undefined, true)).toEqual([{ id: 'upgrade', label: 'Upgrade to Pro' }]);
    expect(getExhaustionPrimaryActions('go', undefined, false, true).map((a) => a.id)).toEqual(['upgrade', 'buyCompute']);
  });

  it('coding-task limit for Build: Buy before the final week, Upgrade in it; entitlement blocks offer nothing', () => {
    const request = { type: 'writeFile' } as any;
    const usage = describeLaunchFailure({ ok: false, reason: 'usage-restricted' } as any, request, 'build');
    expect(usage?.actions).toEqual(['buyCompute']);
    expect(usage?.message).toContain('PawOS Build limit reached');
    const finalWeek = describeLaunchFailure({ ok: false, reason: 'usage-restricted', data: { buildFinalWeek: true } } as any, request, 'build');
    expect(finalWeek?.actions).toEqual(['upgrade']);
    expect(finalWeek?.message).toContain('upgrade to Pro');
    const blocked = describeLaunchFailure({ ok: false, reason: 'entitlement-restricted', message: 'Autonomous Work requires Pro Max.' } as any, request, 'build');
    expect(blocked?.actions).toEqual(['none']);
    expect(blocked?.message).toContain("isn't part of PawOS Build");
    // Go keeps its existing upgrade path.
    expect(describeLaunchFailure({ ok: false, reason: 'usage-restricted' } as any, request, 'go')?.actions).toEqual(['upgrade']);
  });

  it('Build defaults to Paw Flash and never lists Paw Fable', () => {
    expect(getDefaultModelForTier('build')).toBe('paw-flash');
    expect(getAvailableModelsForTier('build', true)).not.toContain('paw-fable');
  });
});

describe('Career helpers', () => {
  it('builds real job-board search links with encoded keywords and location', () => {
    const links = jobSearchLinks('Frontend Developer React', 'Bengaluru');
    expect(links.map((l) => l.label)).toEqual(['LinkedIn', 'Naukri', 'Indeed', 'Internshala']);
    expect(links[0].url).toBe('https://www.linkedin.com/jobs/search/?keywords=Frontend%20Developer%20React&location=Bengaluru');
    expect(links[3].url).toBe('https://internshala.com/internships/keywords-frontend-developer-react');
  });

  it('turns a structured resume into a PDF document with every section', () => {
    const doc = resumeToPdfDocument({
      fullName: 'Priya Sharma',
      headline: 'Frontend Developer',
      contactLine: 'priya@example.com',
      summary: 'Student developer.',
      sections: [
        { heading: 'Projects', items: [{ title: 'Club dashboard', subtitle: 'React', dates: '2025', bullets: ['Built X'] }, { title: 'Portfolio', subtitle: '', dates: '', bullets: ['Built Y'] }] },
      ],
      skills: ['React', 'TypeScript'],
    });
    expect(doc.title).toBe('Priya Sharma');
    expect(doc.subtitle).toBe('Frontend Developer · priya@example.com');
    const text = JSON.stringify(doc.sections);
    for (const part of ['Summary', 'Projects', 'Club dashboard — React (2025)', 'Built X', 'Portfolio', 'Built Y', 'Skills', 'React, TypeScript']) {
      expect(text).toContain(part);
    }
  });
});
