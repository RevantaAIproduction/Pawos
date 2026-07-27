import React from 'react';
import { TerminalIcon, CloudIcon, PlugIcon } from './NavIcons';
import type { ConnectorCategory } from '../../../shared/connectivity/ConnectivityTypes';

/**
 * Small brand-colored badges for the Integrations list — deliberately a different visual language
 * from NavIcons' monochrome outline set, matching how every real integrations marketplace (Slack,
 * Notion, Raycast) renders a connector list: a colored mark first, name second, never raw
 * category/authMethod text as the primary identifier.
 */

function Badge({ background, children, size = 32 }: { background: string; children: React.ReactNode; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function JiraGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.62;
  return (
    <Badge size={size} background="linear-gradient(135deg, #2684FF, #0052CC)">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none">
        <path d="M12 2 3 11a2.4 2.4 0 0 0 0 3.4L12 23l9-8.6a2.4 2.4 0 0 0 0-3.4z" fill="#fff" opacity="0.95" />
        <path d="M12 7.5 6.5 12.5 12 17.5l5.5-5-5.5-5z" fill="#2684FF" />
      </svg>
    </Badge>
  );
}

function GoogleWorkspaceGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.6;
  return (
    <Badge size={size} background="var(--pawos-bg-elevated, #1c1c22)">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none">
        <path d="M12 3 L15.2 9 L21 9.5 L16.5 13.6 L18 20 L12 16.5 Z" fill="#4285F4" transform="rotate(0 12 12)" />
        <circle cx="7.2" cy="8.2" r="3.4" fill="#EA4335" />
        <path d="M17 15.5a3.4 3.4 0 1 1-5.8 2.4 3.4 3.4 0 0 1 5.8-2.4Z" fill="#34A853" />
        <path d="M6.2 14.6a3.4 3.4 0 1 1 3 5.8 3.4 3.4 0 0 1-3-5.8Z" fill="#FBBC05" />
        <circle cx="12" cy="12" r="3.1" fill="#fff" />
      </svg>
    </Badge>
  );
}

function GitHubGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.58;
  return (
    <Badge size={size} background="#181717">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2.5c-5.2 0-9.5 4.3-9.5 9.5 0 4.2 2.7 7.7 6.4 8.9.5.1.6-.2.6-.5v-1.8c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.1-.2-4.3-1-4.3-4.6 0-1 .4-1.9 1-2.5-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.5.6.6 1 1.5 1 2.5 0 3.6-2.2 4.4-4.3 4.6.3.3.6.8.6 1.7v2.5c0 .3.1.6.6.5 3.7-1.2 6.4-4.7 6.4-8.9 0-5.2-4.3-9.5-9.5-9.5Z"
          fill="#fff"
        />
      </svg>
    </Badge>
  );
}

function GitLabGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.6;
  return (
    <Badge size={size} background="linear-gradient(135deg, #FC6D26, #E24329)">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none">
        <path d="M12 20 4.5 10.5 7 4l1.8 6h6.4L17 4l2.5 6.5Z" fill="#fff" />
      </svg>
    </Badge>
  );
}

function LinearGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.6;
  return (
    <Badge size={size} background="#0b0b0f">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4.5 15.5 15.5 4.5" />
        <path d="M4.5 19.5 19.5 4.5" />
        <path d="M8.5 19.5 19.5 8.5" />
      </svg>
    </Badge>
  );
}

function VercelGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.5;
  return (
    <Badge size={size} background="#000">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none">
        <path d="M12 4 21 20H3Z" fill="#fff" />
      </svg>
    </Badge>
  );
}

function NetlifyGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.58;
  return (
    <Badge size={size} background="linear-gradient(135deg, #32E6E2, #05BDBA)">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none">
        <path d="M12 3 19.5 8.5 16.8 19H7.2L4.5 8.5Z" fill="#0b0b0f" opacity="0.85" />
      </svg>
    </Badge>
  );
}

function RailwayGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.6;
  return (
    <Badge size={size} background="linear-gradient(135deg, #a78bfa, #6d28d9)">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 15c3-6 11-6 14 0" />
        <path d="M5 9c3 6 11 6 14 0" />
      </svg>
    </Badge>
  );
}

function CloudflareGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.62;
  return (
    <Badge size={size} background="#F6821F">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none">
        <path d="M6.5 17a3.8 3.8 0 0 1-.4-7.6 5 5 0 0 1 9.6-1.9A4.2 4.2 0 0 1 17.5 17Z" fill="#fff" />
      </svg>
    </Badge>
  );
}

function SupabaseGlyph({ size = 32 }: { size?: number }) {
  const g = size * 0.55;
  return (
    <Badge size={size} background="#181818">
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none">
        <path d="M13 2 4.5 13.5H11L10 22 19.5 10H13Z" fill="#3ECF8E" />
      </svg>
    </Badge>
  );
}

function GenericConnectorGlyph({ label, size = 32 }: { label: string; size?: number }) {
  return (
    <Badge size={size} background="rgba(var(--pawos-overlay-rgb), 0.08)">
      <span style={{ fontSize: size * 0.42, fontWeight: 700, color: 'var(--pawos-text-secondary)' }}>
        {label.charAt(0).toUpperCase()}
      </span>
    </Badge>
  );
}

const CONNECTOR_GLYPHS: Record<string, (props: { size?: number }) => React.ReactElement> = {
  jira: JiraGlyph,
  googleWorkspace: GoogleWorkspaceGlyph,
  github: GitHubGlyph,
  gitlab: GitLabGlyph,
  linear: LinearGlyph,
  vercel: VercelGlyph,
  netlify: NetlifyGlyph,
  railway: RailwayGlyph,
  cloudflare: CloudflareGlyph,
  supabase: SupabaseGlyph,
};

/** Dispatches on connector id — falls back to a neutral initial badge for anything not hand-drawn
 *  yet, so a newly registered connector never renders as a blank space. */
export function ConnectorLogo({ connectorId, displayName, size = 32 }: { connectorId: string; displayName: string; size?: number }) {
  const Glyph = CONNECTOR_GLYPHS[connectorId];
  if (Glyph) return <Glyph size={size} />;
  return <GenericConnectorGlyph label={displayName} size={size} />;
}

const CATEGORY_ICON: Partial<Record<ConnectorCategory, React.ComponentType>> = {
  localApplication: TerminalIcon,
  container: TerminalIcon,
  cloud: CloudIcon,
};

/** Monochrome, matches the settingsNavIcon language — used for "Detected on this machine" rows,
 *  which are local tools/CLIs rather than branded external services. */
export function DetectedToolIcon({ category, size = 18 }: { category: ConnectorCategory; size?: number }) {
  const Icon = CATEGORY_ICON[category] ?? PlugIcon;
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, color: 'var(--pawos-text-secondary)' }}>
      <Icon />
    </span>
  );
}
