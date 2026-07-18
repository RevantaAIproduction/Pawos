import React from 'react';

/**
 * Small inline line icons for the auth screen. No icon library is installed
 * anywhere in this project — these are hand-drawn minimal SVGs rather than
 * adding a dependency for a dozen glyphs.
 */
type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function MailIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2.2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function LockIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function PersonIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" />
    </svg>
  );
}

export function EyeIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

export function EyeOffIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.63A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.3 4.05M7.4 7.35C4.8 9 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.2 0 2.3-.25 3.3-.68" />
      <path d="M9.9 9.9a2.7 2.7 0 0 0 3.8 3.8" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 12h16" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3.5 5 6v5.5c0 4.6 3 7.7 7 9 4-1.3 7-4.4 7-9V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function BoltIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12.5 3 5 13.2h5.2L9.5 21l7.5-10.2h-5.2L12.5 3Z" />
    </svg>
  );
}

export function CloudIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7.5 17.5a4.3 4.3 0 0 1-.6-8.55 5.5 5.5 0 0 1 10.7-1.7A4.2 4.2 0 0 1 17 17.5H7.5Z" />
    </svg>
  );
}

export function HeartIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 20s-7.2-4.5-9.4-9A5 5 0 0 1 12 6.3 5 5 0 0 1 21.4 11c-2.2 4.5-9.4 9-9.4 9Z" />
    </svg>
  );
}

export function PawIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor">
      <ellipse cx="7" cy="9.2" rx="2.1" ry="2.6" />
      <ellipse cx="12" cy="7.4" rx="2.1" ry="2.7" />
      <ellipse cx="17" cy="9.2" rx="2.1" ry="2.6" />
      <path d="M12 12.2c-3.3 0-6 2.1-6 4.9 0 1.6 1.4 2.4 3 2 1-.25 2-.6 3-.6s2 .35 3 .6c1.6.4 3-.4 3-2 0-2.8-2.7-4.9-6-4.9Z" />
    </svg>
  );
}

/** Real four-color Google "G" mark — brand guidelines expect the mark itself, not a plain letter. */
export function GoogleGlyph({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5Z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.5 0-14 4.2-17.7 10.7Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.4 34.8 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.6 5.1C9.9 39.6 16.4 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.5 5.5C41.6 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-3.5Z"
      />
    </svg>
  );
}

export function MicrosoftGlyph({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="2" y="2" width="9.2" height="9.2" fill="#F35325" />
      <rect x="12.8" y="2" width="9.2" height="9.2" fill="#81BC06" />
      <rect x="2" y="12.8" width="9.2" height="9.2" fill="#05A6F0" />
      <rect x="12.8" y="12.8" width="9.2" height="9.2" fill="#FFBA08" />
    </svg>
  );
}

export function AppleGlyph({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M16.7 12.7c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1.9-4 2.4-1.7 2.9-.4 7.3 1.2 9.7.8 1.1 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.7c1.3 0 2.2-1.2 3-2.3.6-.9 1-1.8 1.4-2.7-2.1-.8-2.8-2.6-2.8-3.9ZM14.4 5.4c.7-.8 1.1-1.9 1-3-1 .1-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.4Z" />
    </svg>
  );
}

export function GitHubGlyph({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
