import React from 'react';

/**
 * One consistent icon language for the whole sidebar — 16x16, single
 * stroke weight, currentColor so active/hover states just work via CSS.
 * Hand-authored (no icon library dependency) since the design system has
 * none today and this set only needs to cover the fixed nav list.
 */
const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function HomeIcon() {
  return (
    <svg {...base}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9h13v-9" />
    </svg>
  );
}

export function TalkIcon() {
  return (
    <svg {...base}>
      <path d="M4 5h16v10H9l-4 3.5V15H4z" />
    </svg>
  );
}

export function CompanionIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none" />
      <path d="M8.5 15c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
    </svg>
  );
}

export function HistoryIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function WorkIcon() {
  return (
    <svg {...base}>
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function BrowserIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5Z" />
    </svg>
  );
}

export function CommunicationIcon() {
  return (
    <svg {...base}>
      <rect x="6" y="3.5" width="7" height="12" rx="3.5" />
      <path d="M4.5 12.5A5 5 0 0 0 9.5 17.5" />
      <path d="M9.5 20.5v-3" />
      <path d="M7 20.5h5" />
    </svg>
  );
}

export function OfficeIcon() {
  return (
    <svg {...base}>
      <path d="M7 3.5h7l3.5 3.5V20.5H7z" />
      <path d="M14 3.5V7h3.5" />
      <path d="M9.5 12h5M9.5 15h5M9.5 18h3" />
    </svg>
  );
}

export function CloudIcon() {
  return (
    <svg {...base}>
      <path d="M7 18.5a4 4 0 0 1-.6-7.95 5 5 0 0 1 9.6-1.85A4.5 4.5 0 0 1 17.5 18.5Z" />
    </svg>
  );
}

export function DevelopmentIcon() {
  return (
    <svg {...base}>
      <path d="M9 8.5 4.5 12 9 15.5" />
      <path d="M15 8.5 19.5 12 15 15.5" />
      <path d="M13 5.5 11 18.5" />
    </svg>
  );
}

export function DesktopIcon() {
  return (
    <svg {...base}>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
      <path d="M9 19.5h6" />
      <path d="M12 15.5v4" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
    </svg>
  );
}

export function AccountIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
    </svg>
  );
}

export function CardIcon() {
  return (
    <svg {...base}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.8" />
      <path d="M3.5 9.5h17" />
      <path d="M6.5 14.5h4" />
    </svg>
  );
}

export function BarsIcon() {
  return (
    <svg {...base}>
      <path d="M6 19V11" />
      <path d="M12 19V5" />
      <path d="M18 19v-6" />
    </svg>
  );
}

export function LanguageIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5Z" />
      <path d="M4.5 7.5h15M4.5 16.5h15" />
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 1.9-2.3 3.5" />
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg {...base} strokeWidth={2}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

export function PawIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="1.6" />
      <circle cx="12.5" cy="6" r="1.6" />
      <circle cx="17" cy="8" r="1.6" />
      <path d="M8.5 13.5c0-2 1.6-3 4-3s4 1 4 3-2 5.5-4 5.5-4-3.5-4-5.5Z" />
    </svg>
  );
}

export function SpeakerIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 9.5h3.2L12 6v12l-4.3-3.5H4.5z" />
      <path d="M16 9.2c1 .9 1.6 2 1.6 2.8s-.6 1.9-1.6 2.8" />
      <path d="M18.4 6.8c1.8 1.5 2.8 3.3 2.8 5.2s-1 3.7-2.8 5.2" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg {...base}>
      <path d="M6 10.5a6 6 0 0 1 12 0c0 3.5 1.2 5 1.2 5H4.8s1.2-1.5 1.2-5Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg {...base}>
      <path d="M12 3.5 19 6v6c0 4.2-3 7.2-7 8.5-4-1.3-7-4.3-7-8.5V6l7-2.5Z" />
      <path d="M9 12l2.2 2.2L15.5 9.5" />
    </svg>
  );
}

export function GaugeIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 13 15.5 9" />
      <path d="M12 5.5v1.2M6 8.7l1 .8M18 8.7l-1 .8" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg {...base}>
      <path d="M19 12a7 7 0 0 1-12.2 4.6M5 12a7 7 0 0 1 12.2-4.6" />
      <path d="M5 16.5V19M5 19h2.5M19 7.5V5M19 5h-2.5" />
    </svg>
  );
}

export function OrganizationIcon() {
  return (
    <svg {...base}>
      <circle cx="8.5" cy="7.5" r="2.3" />
      <circle cx="15.5" cy="7.5" r="2.3" />
      <path d="M4 18.5c.7-2.6 2.4-4 4.5-4s3.8 1.4 4.5 4" />
      <path d="M11 18.5c.7-2.6 2.4-4 4.5-4s3.8 1.4 4.5 4" />
    </svg>
  );
}

export function TerminalIcon() {
  return (
    <svg {...base}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
      <path d="M7 9.5 10.5 12 7 14.5" />
      <path d="M12.5 14.5h4.5" />
    </svg>
  );
}

export function AIIcon() {
  return (
    <svg {...base}>
      <path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5L4.5 11 10 9Z" />
    </svg>
  );
}

export function SecurityIcon() {
  return (
    <svg {...base}>
      <rect x="6" y="11" width="12" height="9" rx="1.8" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BrowserToolsIcon() {
  return (
    <svg {...base}>
      <path d="M9 4.5H7a2.5 2.5 0 0 0-2.5 2.5v2" />
      <path d="M15 4.5h2A2.5 2.5 0 0 1 19.5 7v2" />
      <path d="M9 19.5H7A2.5 2.5 0 0 1 4.5 17v-2" />
      <path d="M15 19.5h2a2.5 2.5 0 0 0 2.5-2.5v-2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
