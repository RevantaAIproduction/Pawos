import type { EmailProviderKind } from './CommunicationTypes';

/**
 * Builds a compose deep-link for the user's own real, already-logged-in
 * browser session — Paw never authenticates or holds credentials for any of
 * these providers. `shell.openExternal` hands this straight to the OS
 * default browser, which carries the user's real cookies/session.
 */
export function buildMailComposeUrl(provider: EmailProviderKind, params: { to: string; subject: string; body: string }): string {
  const to = encodeURIComponent(params.to);
  const subject = encodeURIComponent(params.subject);
  const body = encodeURIComponent(params.body);

  switch (provider) {
    case 'gmail':
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
    case 'outlook':
    case 'microsoft365':
    case 'googleWorkspace':
      return `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`;
    case 'default':
    default:
      return `mailto:${to}?subject=${subject}&body=${body}`;
  }
}
