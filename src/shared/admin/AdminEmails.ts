/**
 * PawOS/Revanta admin accounts — decides only whether the desktop app SHOWS admin UI (the sidebar
 * Admin entry). It grants nothing: every admin action is re-authorized by Supabase against the
 * server-side `pawos_admins` allow-list (supabase/migrations/20260924000000_pawos_build_access.sql).
 * Keep this list in sync with that table when adding an admin.
 */
export const PAWOS_ADMIN_EMAILS: readonly string[] = [
  'founder@revantaai.com',
  'pawos@revantaai.com',
  'tharun@revantaai.com',
];

export function isPawosAdminEmail(email: string | null | undefined): boolean {
  return !!email && PAWOS_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * The only account that may turn off the admin console's screen-capture protection (the eye button,
 * for showing data on a video call). Every other admin always sees the console capture-protected.
 */
export const PAWOS_FOUNDER_EMAIL = 'founder@revantaai.com';

export function isPawosFounderEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === PAWOS_FOUNDER_EMAIL;
}
