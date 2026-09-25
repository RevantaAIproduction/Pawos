import { adminRpc } from './AdminService';

/**
 * PawOS Build administration — read-only. Access is granted (one 56-day program per email, no
 * renewal) and revoked from the Supabase SQL editor (pawos_sql_grant_build / pawos_sql_revoke_build); the admin
 * console only lists granted students with their usage, ratings, reports and purchases. Every call
 * runs as the signed-in admin's own Supabase session against SECURITY DEFINER functions that re-check
 * the caller against the server-side pawos_admins allow-list; the database is what refuses non-admins.
 */

export type BuildGrantStatus = 'active' | 'expired' | 'revoked';

export type BuildGrant = {
  id: string;
  email: string;
  userId: string | null;
  cohortId: string;
  status: BuildGrantStatus;
  startsAt: string;
  endsAt: string;
  revokedAt: string | null;
  grantedByEmail: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Latest usage the student's desktop app reported (report_my_build_usage). Visibility only. */
export type BuildUsageSnapshot = {
  weekPcUsed?: number;
  weekPcLimit?: number | null;
  windowPcUsed?: number;
  windowPcLimit?: number | null;
  weekHoursUsed?: number;
  weekHoursLimit?: number | null;
  windowHoursUsed?: number;
  windowHoursLimit?: number | null;
  fileChangesUsed?: number;
  fileChangesCap?: number | null;
  weekResetsAt?: number;
  windowResetsAt?: number | null;
  noFurtherReset?: boolean;
  appVersion?: string;
};

export type BuildRating = { rating: number; comment: string | null; appVersion: string | null; createdAt: string };
export type BuildUserReport = { id?: string; type?: string; summary?: string; component?: string; severity?: string | null; created_at?: string; [key: string]: unknown };
export type BuildPurchase = { id?: string; amount_usd?: number; status?: string; created_at?: string; [key: string]: unknown };

export type BuildInsightUser = BuildGrant & {
  signedIn: boolean;
  usage: { report: BuildUsageSnapshot; reportedAt: string } | null;
  ratings: { count: number; average: number | null; items: BuildRating[] };
  /** null when the reports table isn't available on this project. */
  reports: { count: number; items: BuildUserReport[] } | null;
  /** null when the payments table isn't available on this project. */
  purchases: { count: number; totalUsd: number; items: BuildPurchase[] } | null;
};

export type BuildInsights = { users: BuildInsightUser[]; notes: string[]; generatedAt: string };

export const buildAdminService = {
  insights(): Promise<BuildInsights> {
    return adminRpc<BuildInsights>('admin_build_insights');
  },
  /** How many times the Build users sheet has been downloaded (all admins). */
  async exportCount(): Promise<number> {
    return Number((await adminRpc<number | null>('admin_build_export_count')) ?? 0);
  },
  /** Records one sheet download (who / when / rows) and returns the new total. */
  async logExport(rows: number): Promise<number> {
    return Number(await adminRpc<number>('admin_log_build_export', { p_rows: rows }));
  },
};
