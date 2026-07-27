import type { ConnectorCategory } from '../connectivity/ConnectivityTypes';
import type { ActionResult } from '../actions/ActionTypes';

/**
 * The runtime's general requirement-resolution vocabulary — not connectivity-specific. 'capability'
 * is the only kind implemented today. The union is deliberately left open for later kinds
 * (confirmation, approval, workspaceSelection, repositorySelection, organizationSelection,
 * environmentSelection, billing, policy) — each one lands as one more interface here and one more
 * resolver registered with RequirementGate, never a change to an existing member or to
 * RequirementGate itself. No resolver for any of those kinds exists yet; this is the extension
 * point, not an implementation.
 */
export type RequirementKind = 'capability';

export interface CapabilityRequirement {
  kind: 'capability';
  category: ConnectorCategory;
  /** Contextual reason shown to the user, e.g. 'The Revanta AI repository requires connecting GitHub.' */
  reasonHint?: string;
  /**
   * A specific capability name from `ConnectorDefinition.capabilities` (e.g. `'listThreads'`).
   * Absent = today's coarse category-only check (is *any* connector for this category
   * connected) — existing single-capability requirements like Jira's `projectManagement` never
   * need to set this. When present, the resolver additionally checks whether an
   * already-connected connector's *live* capability set actually includes it; if not, the
   * requirement resolves as needing an incremental scope grant rather than a full reconnect
   * (see `CapabilityProviderCandidate.grantMode` below).
   */
  capability?: string;
}

export type Requirement = CapabilityRequirement;

export interface RequirementResolution {
  satisfied: boolean;
  /** Present only when !satisfied — a ready-to-return ActionResult carrying whatever UI the
   *  blocked requirement needs (a connect form, a confirmation prompt, a selection list —
   *  entirely up to the resolver that produced it). */
  blockingResult?: ActionResult;
}

/** One candidate provider that could satisfy a capability requirement. `connectVia: 'inline'`
 *  means `fields` describes a form PawOS can render and submit right in the conversation;
 *  `'settings'` means there's no inline flow yet and the UI should route to the existing Settings
 *  connector panel instead. */
export interface CapabilityProviderCandidate {
  connectorId: string;
  connectorName: string;
  connectVia: 'inline' | 'settings';
  fields?: { name: string; label: string; secret?: boolean; placeholder?: string }[];
  /** Absent/'connect' = today's full-connect flow (unchanged). 'incrementalScope' means this
   *  connector is already connected but missing the one capability the requirement needs —
   *  the UI should offer "Grant {missingCapability} access" instead of a fresh connect form,
   *  and the resulting connect call should pass `incrementalCapabilities: [missingCapability]`
   *  rather than re-requesting everything. */
  grantMode?: 'connect' | 'incrementalScope';
  /** Set alongside grantMode: 'incrementalScope' — the specific capability name being requested. */
  missingCapability?: string;
}

/** What CapabilityRequirementResolver attaches to ActionResult.confirmation.capabilities — kept
 *  here (not inline in ActionTypes.ts) so both the resolver and the shared action-result type
 *  reference the same shape. */
export interface CapabilityConfirmation {
  category: ConnectorCategory;
  label: string;
  reasonHint?: string;
  candidateProviders: CapabilityProviderCandidate[];
}
