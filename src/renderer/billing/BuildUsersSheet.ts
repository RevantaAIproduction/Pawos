import * as XLSX from 'xlsx';
import type { BuildInsightUser } from './BuildAdminService';

/**
 * "ghost.rider@gmail.com" → "gh****@gmail.com": the first two letters of the name, then ****, then
 * the domain. Very short names keep one letter. The admin panel shows full emails; anything that
 * leaves the app (the downloaded sheet) only ever carries this masked form.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '****';
  const name = email.slice(0, at);
  const keep = name.length > 2 ? 2 : 1;
  return `${name.slice(0, keep)}****${email.slice(at)}`;
}

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const num = (n: number | null | undefined, places = 2) => (typeof n === 'number' ? Math.round(n * 10 ** places) / 10 ** places : '');

/**
 * One row per Build student for the downloadable proof sheet. Emails are masked; the hidden file
 * limit is left out (it is never shown outside the admin panel).
 */
export function buildUsersSheetRows(users: BuildInsightUser[], now = Date.now()): Record<string, string | number>[] {
  return users.map((u) => {
    const r = u.usage?.report;
    const daysLeft = u.status === 'active' ? Math.max(0, Math.ceil((Date.parse(u.endsAt) - now) / 86_400_000)) : 0;
    return {
      Email: maskEmail(u.email),
      Cohort: u.cohortId,
      Status: u.status,
      'Access start': date(u.startsAt),
      'Access end': date(u.status === 'revoked' ? u.revokedAt : u.endsAt),
      'Days left': daysLeft,
      'Signed in': u.signedIn ? 'Yes' : 'No',
      'PC used this week': num(r?.weekPcUsed),
      'PC weekly limit': num(r?.weekPcLimit, 0),
      'Active hours this week': num(r?.weekHoursUsed),
      'Weekly hours limit': num(r?.weekHoursLimit, 0),
      'Last usage report': date(u.usage?.reportedAt),
      'Average rating': u.ratings.average ?? '',
      Ratings: u.ratings.count,
      Reports: u.reports?.count ?? '',
      'Credit purchases': u.purchases?.count ?? '',
      'Credits bought (USD)': u.purchases ? num(u.purchases.totalUsd) : '',
    };
  });
}

export function buildUsersSummaryRows(users: BuildInsightUser[], now = Date.now()): Record<string, string | number>[] {
  const rated = users.filter((u) => u.ratings.count > 0);
  const ratingSum = users.reduce((s, u) => s + (u.ratings.average ?? 0) * u.ratings.count, 0);
  const ratingCount = users.reduce((s, u) => s + u.ratings.count, 0);
  return [
    { Metric: 'Generated', Value: new Date(now).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' },
    { Metric: 'Build students granted', Value: users.length },
    { Metric: 'Active now', Value: users.filter((u) => u.status === 'active').length },
    { Metric: 'Signed in to PawOS', Value: users.filter((u) => u.signedIn).length },
    { Metric: 'Using PawOS (usage reported)', Value: users.filter((u) => u.usage !== null).length },
    { Metric: 'Students who rated', Value: rated.length },
    { Metric: 'Average rating', Value: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : '' },
    { Metric: 'Reports filed', Value: users.reduce((s, u) => s + (u.reports?.count ?? 0), 0) },
    { Metric: 'Credit purchases', Value: users.reduce((s, u) => s + (u.purchases?.count ?? 0), 0) },
    { Metric: 'Credits bought (USD)', Value: Math.round(users.reduce((s, u) => s + (u.purchases?.totalUsd ?? 0), 0) * 100) / 100 },
  ];
}

/** The .xlsx workbook bytes: a Summary sheet and a Build users sheet (masked emails). */
export function buildUsersWorkbook(users: BuildInsightUser[], now = Date.now()): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildUsersSummaryRows(users, now)), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildUsersSheetRows(users, now)), 'Build users');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/** Saves the workbook through the browser download flow (Electron shows a Save dialog). */
export function downloadBuildUsersSheet(users: BuildInsightUser[], now = Date.now()): void {
  const blob = new Blob([buildUsersWorkbook(users, now)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pawos-build-users-${new Date(now).toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
