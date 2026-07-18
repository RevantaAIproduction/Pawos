/** Shared design tokens for every email — one place to keep the look consistent across ~20 templates. */
export const theme = {
  colors: {
    background: '#0B1020',
    card: 'rgba(255,255,255,0.04)',
    cardBorder: 'rgba(255,255,255,0.08)',
    text: '#F5F5F7',
    textMuted: '#96969E',
    textFaint: '#6C6C74',
    primary: '#2FD4FF',
    secondary: '#4A7DFF',
    accent: '#8A6BFF',
    danger: '#FF6B6B',
    success: '#4ADE80',
  },
  font: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
} as const;

/** Every top-level email template receives these — set by EmailService (cid: attachments when actually sending) or the mail preview page (data: URIs for browser display). Keeps Logo.tsx from needing to know which mode it's in. */
export type BrandingProps = {
  logoFullSrc: string;
  logoIconSrc: string;
};
