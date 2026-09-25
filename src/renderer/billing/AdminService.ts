import { getSupabaseClient } from '../auth/supabaseClient';
import { getServerSessionLinkFailure } from '../auth/serverSessionLink';

/**
 * Admin console data — every call runs as the signed-in admin's own Supabase session against
 * SECURITY DEFINER functions that re-check the caller against `pawos_admins`
 * (supabase/migrations/20260924010000_pawos_admin_console.sql). Rows from tables whose live schema
 * varies are returned whole (credentials already redacted server-side) and rendered generically.
 */

export type AdminRow = Record<string, unknown>;

export type AdminOverview = {
  users: number;
  newUsers7d: number;
  newUsers30d: number;
  activeUsers7d: number;
  buildActive: number;
  buildTotal: number;
  admins: number;
  organizations?: number;
  autonomousRuns?: { active: number; staleOver24h: number; last7d: number };
  usageCreditPayments?: { count30d: number; amountUsd30d: number };
  diagnosticIssuesByStatus?: Record<string, number>;
  waitlist?: number;
  notes: string[];
  generatedAt: string;
};

export type AdminUserSummary = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  provider: string | null;
  buildStatus: 'active' | 'expired' | 'revoked' | null;
  isAdmin: boolean;
};

export type AdminUserDetail = {
  user: { id: string; email: string | null; createdAt: string; lastSignInAt: string | null; emailConfirmedAt: string | null; provider: string | null; providers: string[] | null; name: string | null };
  isAdmin: boolean;
  build: AdminRow | null;
  usageCredits?: AdminRow | null;
  organizations?: AdminRow[];
  deviceSessions?: AdminRow[];
  usageCreditPayments?: AdminRow[];
  usageCreditDeductions?: AdminRow[];
  autonomousRuns?: AdminRow[];
  diagnosticReports?: AdminRow[];
  notes: string[];
};

export type AdminAuditEntry = { source: string; at: string; actor: string; action: string; target: string | null; detail: AdminRow };
export type AdminAccount = { email: string; addedAt: string; hasAccount: boolean; isYou: boolean };

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: 'Your account is not authorized to use the PawOS admin console.',
  not_authenticated: 'Sign in again to use the admin console.',
  invalid_email: 'Enter a valid email address.',
  not_found: 'Not found.',
  cannot_remove_self: "You can't remove your own admin access.",
  last_admin: "You can't remove the last admin.",
  not_active: "That email's Build access isn't active. Build is one 56-day program per email and can't be renewed or granted again.",
};

export function toAdminError(error: { message?: string } | null): Error {
  const code = error?.message ?? '';
  // No Supabase session behind this PawOS sign-in (the request ran as anonymous).
  if (/permission denied for function|JWT/i.test(code)) {
    const link = getServerSessionLinkFailure();
    if (link) {
      return new Error(
        `Your ${link.provider === 'google' ? 'Google' : 'Microsoft'} sign-in worked, but PawOS's server rejected it, so admin tools can't run. Server said: "${link.message}". Sign out and sign in again; if this repeats, the Supabase ${link.provider === 'google' ? 'Google' : 'Azure'} provider needs this app's client ID added under Authorized Client IDs.`
      );
    }
    return new Error('Your PawOS sign-in has no active server session. Sign out and sign in again, then try again.');
  }
  return new Error(ERROR_MESSAGES[code] ?? (code || 'The request failed.'));
}

export async function adminRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw toAdminError(error);
  return data as T;
}

export const adminService = {
  overview: () => adminRpc<AdminOverview>('admin_overview'),
  searchUsers: (query: string, limit = 50) => adminRpc<AdminUserSummary[]>('admin_search_users', { p_query: query || null, p_limit: limit }),
  userDetail: (userId: string) => adminRpc<AdminUserDetail>('admin_user_detail', { p_user_id: userId }),
  payments: (limit = 50) => adminRpc<{ usageCreditPayments?: AdminRow[]; organizationBillingEvents?: AdminRow[]; notes: string[] }>('admin_list_payments', { p_limit: limit }),
  autonomousRuns: (activeOnly: boolean, limit = 50) =>
    adminRpc<{ runs: AdminRow[]; notes: string[] }>('admin_list_autonomous_runs', { p_active_only: activeOnly, p_limit: limit }),
  diagnostics: (limit = 50) => adminRpc<{ issues?: AdminRow[]; reports?: AdminRow[]; notes: string[] }>('admin_list_diagnostics', { p_limit: limit }),
  audit: (limit = 100) => adminRpc<{ entries: AdminAuditEntry[]; notes: string[] }>('admin_list_audit', { p_limit: limit }),
  listAdmins: () => adminRpc<AdminAccount[]>('admin_list_admins'),
  addAdmin: (email: string) => adminRpc<{ result: 'added' | 'already_admin'; email: string }>('admin_add_admin', { p_email: email }),
  removeAdmin: (email: string) => adminRpc<{ result: 'removed'; email: string }>('admin_remove_admin', { p_email: email }),
  /** Server-side allow-list check for the caller (true/false; false on any failure). */
  async isAdmin(): Promise<boolean> {
    try {
      return (await adminRpc<boolean>('pawos_is_build_admin')) === true;
    } catch {
      return false;
    }
  },
};
