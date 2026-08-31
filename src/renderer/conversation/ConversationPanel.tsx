import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './conversationPanel.module.css';
import type { ConversationSnapshot, SubmittedInputContext } from './ConversationTypes';
import { conversationStateLabels } from './ConversationTypes';
import { TaskCard } from './TaskCard';
import { ProjectPlanCard } from './ProjectPlanCard';
import { isProjectPlanMessage } from './ProjectPlanningUX';
import { SupportPersonaIndicator, useSupportPersona } from './SupportPersonaIndicator';
import { isSupportRequest } from '../../shared/support/SupportTrigger';
import { useWindowContext } from './WindowContextProvider';
import { getSupabaseClient } from '../auth/supabaseClient';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import { CreditsRequiredNotice, getExhaustionPrimaryActions } from '../ui/billing/CreditsRequiredNotice';
import type { EntitlementSnapshot, SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { DEFAULT_EXECUTION_MODE, EXECUTION_MODE_CATALOG, type ConversationExecutionMode } from '../../shared/actions/ExecutionModeTypes';
import {
  DEFAULT_PAW_MODEL_ID,
  PAW_MODEL_CATALOG,
  REASONING_PAW_MODEL_IDS,
  getPawModel,
  type PawModelDescriptor,
  type PawModelId,
} from '../../shared/ai/PawModelTypes';
import { formatTierLabel } from '../billing/EntitlementDisplay';
import { ActivitySidebar } from './ActivitySidebar/ActivitySidebar';
import { useActivityStream } from './ActivitySidebar/useActivityStream';
import { LiveStatus } from './LiveStatus/LiveStatus';
import { ExtensionRenderer, type ExtensionRendererProps } from './extensions/ExtensionRenderer';
import type { ExtensionExpandRequest } from './extensions/ExtensionTypes';
import { LiveWorkStream } from './LiveWorkStream/LiveWorkStream';

/** Reasoning models are genuinely selectable (they change which model actually answers); the rest
 *  of the catalog are automatic, specialized routers Paw invokes per-need — shown for transparency
 *  only, never clickable, mirroring AISettingsPage.tsx's own "Default reasoning model" vs. "All Paw
 *  models" split. */
type ModelUiState = 'available' | 'locked' | 'exhausted' | 'comingSoon';

function getModelUiState(model: PawModelDescriptor, entitlement: EntitlementSnapshot | null | undefined): ModelUiState {
  if (model.status === 'comingSoon') return 'comingSoon';
  if (!entitlement || !entitlement.models.includes(model.id)) return 'locked';
  if (!entitlement.hasCreditsRemaining) return 'exhausted';
  return 'available';
}

/** Below this, a paste is probably just a short phrase someone copied — above it, it reads as reference material to skim/summarize rather than a spoken command. */
const PASTE_LENGTH_THRESHOLD = 200;

/** Plain-text-readable formats only — full document/spreadsheet parsing (PDF, docx, xlsx) is real future work, not something to fake here. Images are handled separately below (Reference Intelligence), not as text. */
const SUPPORTED_FILE_EXTENSIONS = ['.txt', '.csv', '.json', '.md', '.log'];
/** Reference material for Reference/Image Intelligence (a screenshot, mockup, logo) — analyzed via analyze_reference_image, never read as text. */
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const MAX_FILE_CHARS = 20_000;

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

function getTierAppropriateConnectors(tier?: string): string[] {
  const freeConnectors: string[] = [];
  const proConnectors = ['Gmail', 'Google Drive', 'Slack', 'Google Calendar', 'Outlook', 'Microsoft Teams'];
  const proMaxConnectors = [...proConnectors, 'Jira', 'Linear', 'GitHub', 'GitLab', 'Notion'];

  switch (tier) {
    case 'pro':
      return proConnectors;
    case 'pro_max':
    case 'team':
    case 'enterprise':
      return proMaxConnectors;
    default:
      return freeConnectors;
  }
}

function getConnectorIcon(name: string): JSX.Element {
  const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', style: { flexShrink: 0 } };

  switch (name) {
    case 'Gmail':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" fill="none">
          <rect x="2" y="4" width="20" height="16" rx="2" fill="#EA4335"/>
          <path d="M22 4l-10 8L2 4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );
    case 'Google Drive':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M8 2l7 12-7 12H2l7-12L2 2h6z" fill="#0F9D58"/>
          <path d="M16 2l7 12-7 12h6l7-12-7-12h-6z" fill="#4285F4"/>
          <path d="M8 14l8-12 8 12-8 12-8-12z" fill="#FBBC04"/>
        </svg>
      );
    case 'Google Calendar':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" fill="#4285F4"/>
          <rect x="3" y="4" width="18" height="4" fill="#1F73E7"/>
          <circle cx="12" cy="14" r="3" fill="white"/>
        </svg>
      );
    case 'Slack':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M5 2c-1.1 0-2 .9-2 2v3h3V4c0-1.1-.9-2-2-2zm0 8c-1.1 0-2 .9-2 2v3h3v-3c0-1.1-.9-2-2-2zm6-8c-1.1 0-2 .9-2 2v3h3V4c0-1.1-.9-2-2-2zm0 8c-1.1 0-2 .9-2 2v3h3v-3c0-1.1-.9-2-2-2zm6-8c-1.1 0-2 .9-2 2v3h3V4c0-1.1-.9-2-2-2zm0 8c-1.1 0-2 .9-2 2v3h3v-3c0-1.1-.9-2-2-2z" fill="#E01E5A"/>
          <path d="M19 12c0-1.1-.9-2-2-2h-3v3h3c1.1 0 2-.9 2-2zm-8 0c0-1.1-.9-2-2-2H6v3h3c1.1 0 2-.9 2-2z" fill="#36C5F0"/>
        </svg>
      );
    case 'Outlook':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4"/>
          <text x="12" y="16" fontSize="14" fontWeight="bold" fill="white" textAnchor="middle">O</text>
        </svg>
      );
    case 'Microsoft Teams':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <rect x="2" y="2" width="8" height="8" fill="#6264A7"/>
          <rect x="12" y="2" width="8" height="8" fill="#7FBA00"/>
          <rect x="2" y="12" width="8" height="8" fill="#00A4EF"/>
          <rect x="12" y="12" width="8" height="8" fill="#FFB900"/>
        </svg>
      );
    case 'Jira':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#0052CC"/>
          <path d="M12 6v12M6 12h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );
    case 'Linear':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <rect x="2" y="2" width="20" height="20" rx="2" fill="#5E6AD2"/>
          <path d="M6 12h12M12 6v12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );
    case 'GitHub':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.47-1.1-1.47-.9-.62.07-.61.07-.61 1 .07 1.52 1.03 1.52 1.03.88 1.52 2.32 1.08 2.89.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.93 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02.8-.22 1.66-.33 2.5-.33s1.7.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.82-2.34 4.68-4.57 4.92.36.31.69.92.69 1.85v2.75c0 .26.18.58.69.48C19.13 20.17 22 16.42 22 12 22 6.48 17.52 2 12 2z" fill="#1B1F23"/>
        </svg>
      );
    case 'GitLab':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M12 2l7.5 22.5H4.5L12 2z" fill="#FC6D26"/>
          <path d="M12 2L4.5 24.5h3.75L12 2z" fill="#E24329"/>
        </svg>
      );
    case 'Notion':
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <rect x="2" y="2" width="20" height="20" fill="#000"/>
          <text x="12" y="16" fontSize="14" fontWeight="bold" fill="white" textAnchor="middle">N</text>
        </svg>
      );
    default:
      return (
        <svg {...iconProps} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
        </svg>
      );
  }
}

export function ConversationPanel({
  snapshot,
  onClose,
  onStartListening,
  onStopListening,
  onSendTranscript,
  onSetVoiceOutputEnabled,
  onStopSpeechPlayback,
  onSpeakMessage,
  onRetryAction,
  onOpenPath,
  onConnectCapability,
  onNavigateToSettingsConnector,
  onOpenTicketBalance,
  onPlanDecision,
  creditsNoticeTier,
  creditsNoticeSeatTier,
  creditsNoticePooled,
  enterpriseContactAvailable,
  onDismissCreditsNotice,
  onUpgrade,
  onBuyCompute,
  onContactSales,
  onContactAdmin,
  onRequestMoreCompute,
  pawCreditsBalanceUsd,
  onUseCredits,
  redeemingCredits,
  redeemCreditsError,
  executionMode,
  onSetExecutionMode,
  bypassPermissionsEnabled,
  entitlement,
  activePawModel,
  modelTierRequirements,
  onSelectModel,
  currentWorkingFile = undefined,
  wakeWord = 'PawOS',
  streamingPawCompute = 0,
  streamingElapsedSeconds = 0,
  onCancel,
  onOpenSidebar,
}: {
  snapshot: ConversationSnapshot;
  onClose: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onSendTranscript: (text: string, context?: SubmittedInputContext) => void;
  onSetVoiceOutputEnabled: (enabled: boolean) => void;
  onStopSpeechPlayback: () => void;
  onSpeakMessage: (text: string) => void;
  /** "Retry failed step" in a Task Card's Details panel — re-runs one action from its own recorded request. */
  onRetryAction?: (taskId: string, actionId: string) => void;
  /** "Open" next to a file/folder a Task Card touched. */
  onOpenPath?: (path: string, kind: 'file' | 'folder') => void;
  /** Inline "Connect {capability}" submit from a paused Task Card. */
  onConnectCapability?: (
    taskId: string,
    actionId: string,
    connectorId: string,
    fields: Record<string, string>,
    opts?: { incrementalCapability?: string }
  ) => Promise<{ ok: boolean; message?: string }> | void;
  /** "Connect in Settings" for a capability with no inline form yet. */
  onNavigateToSettingsConnector?: (connectorId: string) => void;
  /** "Add Funds" on a balance-restricted Autonomous Work failure — opens the Ticket Balance wallet (Settings → Billing). */
  onOpenTicketBalance?: () => void;
  onPlanDecision?: (planId: string, decision: 'approved' | 'rejected', message: string) => void;
  /** Set when the last submit was blocked by the entitlement/credit gate (see useConversationController). */
  creditsNoticeTier?: SubscriptionTierId | null;
  /** Only meaningful when tier === 'team' — which seat rate determines the exhaustion notice's upgrade target. */
  creditsNoticeSeatTier?: SeatTier;
  /** True only for Enterprise (pooled Paw Compute) — see EntitlementSnapshot.pooled. */
  creditsNoticePooled?: boolean;
  /** Whether the Pro Max -> Enterprise "Contact Sales" path is reachable from this screen. */
  enterpriseContactAvailable?: boolean;
  onDismissCreditsNotice?: () => void;
  /** Opens the in-app upgrade flow for the next tier up — omit where there's no real navigation target yet. */
  onUpgrade?: () => void;
  /** Opens the Paw Compute top-up flow — omit where there's no real navigation target yet. */
  onBuyCompute?: () => void;
  /** Opens the Enterprise info/signup page — omit where there's no real navigation target yet. */
  onContactSales?: () => void;
  onContactAdmin?: () => void;
  onRequestMoreCompute?: () => void;
  pawCreditsBalanceUsd?: number;
  onCancel?: () => void;
  onUseCredits?: () => void;
  redeemingCredits?: boolean;
  redeemCreditsError?: string | null;
  /** The composer's mode picker — see ExecutionModeTypes.ts. Defaults to Auto (today's behavior) when omitted. */
  executionMode?: ConversationExecutionMode;
  onSetExecutionMode?: (mode: ConversationExecutionMode) => void;
  /** Whether the Settings-only "Bypass permissions" toggle is currently on — gates whether that mode is selectable at all. */
  bypassPermissionsEnabled?: boolean;
  /** The composer's model picker — see PawModelTypes.ts/AIRouter.ts. Authoritative for what's actually
   *  selectable/locked/exhausted; the renderer never grants access on its own (see selectModel in
   *  useConversationController.ts and the submitTranscript backstop it also adds). */
  entitlement?: EntitlementSnapshot | null;
  activePawModel?: PawModelId;
  modelTierRequirements?: Partial<Record<PawModelId, SubscriptionTierId>>;
  onSelectModel?: (id: PawModelId) => void;
  currentWorkingFile?: string;
  wakeWord?: string;
  streamingPawCompute?: number;
  streamingElapsedSeconds?: number;
  onOpenSidebar?: (cardType: 'terminal' | 'worktree' | 'browser' | 'background-tasks') => void;
}) {
  const windowCtx = useWindowContext();
  const isStreaming = snapshot.state === 'thinking' || snapshot.state === 'performingAction';
  const ipc = useIpcBridge();

  const [draft, setDraft] = useState('');
  const [wasPasted, setWasPasted] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<{ text: string; context?: SubmittedInputContext } | null>(null);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [supportPersona, setSupportPersona] = useState<string | null>(null);
  const [showPersonaButton, setShowPersonaButton] = useState(true);
  const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [showHeaderButtons, setShowHeaderButtons] = useState(false);
  const [prMenuOpen, setPrMenuOpen] = useState(false);
  const [hamburgerMenuOpen, setHamburgerMenuOpen] = useState(false);
  const [threeDotsMenuOpen, setThreeDotsMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [proposedPlan, setProposedPlan] = useState<{
    id: string;
    name: string;
    description: string;
    content: string;
    diagrams: string[];
    status: 'proposed' | 'revising' | 'accepted';
  } | null>(null);
  const [planRevisionFeedback, setPlanRevisionFeedback] = useState('');
  const [showPlanSidebar, setShowPlanSidebar] = useState(false);
  const [showTierUpgradePopup, setShowTierUpgradePopup] = useState(false);
  // Incognito Mode (Go tier only): Private session, doesn't persist data or history
  // BUT still calculates Paw Computes usage in real-time (no free pass)
  const [incognitoMode, setIncognitoMode] = useState(false);

  // Limits tracking state
  const [limitsState, setLimitsState] = useState<{
    limit5hrTriggered: boolean;
    limit5hrResetAt: number | null;
    limitWeeklyTriggered: boolean;
    limitWeeklyResetAt: number | null;
    limitMonthlyTriggered: boolean;
    limitMonthlyResetAt: number | null;
    activeLimit: '5hr' | 'weekly' | 'monthly' | null;
    showLimitDetails: boolean;
    countdownTime: string;
    closedBars: Record<string, boolean>;
    limitCardMode: 'initial' | 'retry';
  }>({
    limit5hrTriggered: false,
    limit5hrResetAt: null,
    limitWeeklyTriggered: false,
    limitWeeklyResetAt: null,
    limitMonthlyTriggered: false,
    limitMonthlyResetAt: null,
    activeLimit: null,
    showLimitDetails: false,
    countdownTime: '0h 0m 0s',
    closedBars: {},
    limitCardMode: 'initial'
  });

  // Credits usage tracking (in dollars and PC)
  const [creditsUsage, setCreditsUsage] = useState({
    dollarBought: 0,        // Total purchased ($10 = 1000 PC)
    dollarUsedThisSession: 0, // Total spent this session
    pcsUsedThisSession: 0    // Total PC used this session
  });

  // Active task being worked on
  const [activeTask, setActiveTask] = useState<{ gitConnected?: boolean } | null>(null);

  // Conversation control object
  const conversation = useMemo(() => ({ open: () => { /* reopen/refocus conversation */ } }), []);

  const dollarRemaining = creditsUsage.dollarBought - creditsUsage.dollarUsedThisSession;

  // Voice features state
  const [voiceState, setVoiceState] = useState({
    isRecording: false,
    speakerEnabled: false,
    transcript: '',
    autoSend: false,
    showSpeakerMenu: false
  });

  // Calculate dollar amount from PC (100 PC = $1)
  const calculateDollarFromPC = (pc: number) => (pc / 100).toFixed(2);

  // Calculate PC cost based on line edits (tiered pricing)
  const calculatePCCost = (lineEdits: number): number => {
    if (lineEdits <= 1) return 1;
    if (lineEdits <= 10) return lineEdits;
    // Scale up for larger edits: 20 lines = 40 PC (2x rate)
    return Math.floor(lineEdits * 2);
  };

  // Apply speaker multiplier (2x when speaker enabled)
  const getCostWithSpeaker = (baseCost: number): number => {
    return voiceState.speakerEnabled ? baseCost * 2 : baseCost;
  };
  const [permissions, setPermissions] = useState({
    readFiles: false,
    readCurrentCode: false,
    analyzeTicket: false,
    analyzeRepo: false,
    analyzeGitHistory: false,
    recordMeeting: false,
    recordSummary: false,
    editCode: false,
    modifyFiles: false,
    runCode: false,
    executeScripts: false,
    executeShell: false,
    pushCode: false,
    commitChanges: false,
    createBranches: false,
    createPullRequests: false,
    accessText: false,
    processImages: false,
    accessWebsites: false,
    accessAPIs: false,
    storeData: false,
    shareContext: false,
  });
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [slashCommandsMenuOpen, setSlashCommandsMenuOpen] = useState(false);
  const [connectorsSubmenuOpen, setConnectorsSubmenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const connectorsMenuRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef(snapshot.messages.length > 0 ? 'conv-' + Date.now() : null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const prMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Activity sidebar
  const { activities, selectedActivityId, setSelectedActivityId, hasActivity } = useActivityStream(snapshot);

  // Message extension handlers
  const handleExtensionExpand = (request: ExtensionExpandRequest) => {
    // Map extension expand requests to the appropriate tool
    switch (request.target) {
      case 'terminal':
        onOpenSidebar?.('terminal');
        break;
      case 'worktree':
        onOpenSidebar?.('worktree');
        break;
      case 'browser':
        onOpenSidebar?.('browser');
        break;
      case 'agents':
      case 'tasks':
        onOpenSidebar?.('background-tasks');
        break;
      default:
        break;
    }
  };

  const handleExtensionAction = async (
    extensionId: string,
    action: string,
    payload?: Record<string, unknown>
  ) => {
    // Handle permission approval/denial (P1-A governance)
    if (action === 'allow-once' || action === 'allow-always' || action === 'deny') {
      const approvalId = payload?.approvalId as string | undefined;
      if (approvalId) {
        if (action === 'deny') {
          await ipc.governanceDeny(approvalId);
        } else if (action === 'allow-once' || action === 'allow-always') {
          await ipc.governanceApprove(approvalId);
        }
      }
    }

    // Handle result review (Accept / Needs Changes)
    if (action === 'accept' || action === 'needs-changes') {
      // Send message to reasoning model to continue conversation
      // This proves PawOS talked to the backend agent
      if (action === 'accept') {
        onSendTranscript('I accept this result. Please proceed to finalization.');
      } else if (action === 'needs-changes') {
        onSendTranscript('This needs changes. Let me revise the approach.');
      }
    }

    // Handle finalization actions (Save, Commit, Push, Deploy, Comment, Done)
    if (['save', 'commit', 'push', 'deploy', 'comment', 'done'].includes(action)) {
      onSendTranscript(`Finalize: ${action}`);
    }
  };

  // Keyboard shortcuts for permissions: Alt+Enter = Allow, ESC = Deny
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!permissionsOpen) return;

      // Alt+Enter to allow all permissions
      if ((e.altKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        setPermissions({
          readFiles: true,
          readCurrentCode: true,
          analyzeTicket: true,
          analyzeRepo: true,
          analyzeGitHistory: true,
          recordMeeting: true,
          recordSummary: true,
          editCode: true,
          modifyFiles: true,
          runCode: true,
          executeScripts: true,
          executeShell: true,
          pushCode: true,
          commitChanges: true,
          createBranches: true,
          createPullRequests: true,
          accessText: true,
          processImages: true,
          accessWebsites: true,
          accessAPIs: true,
          storeData: true,
          shareContext: true,
        });
        setPermissionsOpen(false);
      }

      // ESC to deny
      if (e.key === 'Escape') {
        e.preventDefault();
        setPermissionsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [permissionsOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!headerMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [headerMenuOpen]);

  // Load user email and persisted persona on mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          setUserEmail(session.user.email);
        }
      } catch {}
    };
    const loadPersistedPersona = async () => {
      const convId = conversationIdRef.current;
      if (!convId || supportPersona) return;
      try {
        const supabase = await getSupabaseClient();
        const { data } = await supabase
          .from('support_sessions')
          .select('assigned_persona')
          .eq('conversation_id', convId)
          .maybeSingle();
        if (data?.assigned_persona) {
          setSupportPersona(data.assigned_persona);
          setShowPersonaButton(false);
        }
      } catch {}
    };
    loadUserData();
    loadPersistedPersona();
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const lastSyncedVoiceDraftRef = useRef('');
  const activeExecutionMode = executionMode ?? DEFAULT_EXECUTION_MODE;
  const activeModeDescriptor =
    EXECUTION_MODE_CATALOG.find((m) => m.id === activeExecutionMode) ?? EXECUTION_MODE_CATALOG.find((m) => m.id === DEFAULT_EXECUTION_MODE)!;
  const activePawModelDescriptor = getPawModel(activePawModel ?? DEFAULT_PAW_MODEL_ID);

  // Clear isInterrupting flag when task reaches terminal state (after interrupt request completes)
  useEffect(() => {
    const isTerminalState = snapshot.state === 'completed' || snapshot.state === 'interrupted' || snapshot.state === 'error';
    if (isTerminalState && isInterrupting) {
      setIsInterrupting(false);
    }
  }, [snapshot.state, isInterrupting]);

  // Auto-submit queued message ONLY when task reaches terminal state (completed/interrupted/error)
  // Do NOT submit if waiting for permission, waiting for approval, or other non-terminal states
  useEffect(() => {
    const isTerminalState = snapshot.state === 'completed' || snapshot.state === 'interrupted' || snapshot.state === 'error';
    if (isTerminalState && queuedMessage && !isInterrupting) {
      onSendTranscript(queuedMessage.text, queuedMessage.context);
      setQueuedMessage(null);
    }
  }, [snapshot.state, queuedMessage, isInterrupting, onSendTranscript]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target as Node)) setModeMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [modeMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!connectorsSubmenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (connectorsMenuRef.current && !connectorsMenuRef.current.contains(event.target as Node)) setConnectorsSubmenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [connectorsSubmenuOpen]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) setAddMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [addMenuOpen]);

  useEffect(() => {
    if (!slashCommandsMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(event.target as Node)) setSlashCommandsMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [slashCommandsMenuOpen]);

  // Countdown timer for limits
  useEffect(() => {
    if (!limitsState.activeLimit || !limitsState.limit5hrResetAt && !limitsState.limitWeeklyResetAt && !limitsState.limitMonthlyResetAt) return;
    const interval = setInterval(() => {
      const resetAt = limitsState.limit5hrResetAt || limitsState.limitWeeklyResetAt || limitsState.limitMonthlyResetAt;
      if (!resetAt) return;

      const remaining = Math.max(0, resetAt - Date.now());
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      setLimitsState(prev => ({
        ...prev,
        countdownTime: `${hours}h ${minutes}m ${seconds}s`
      }));

      if (remaining <= 0) {
        setLimitsState(prev => ({
          ...prev,
          limit5hrTriggered: false,
          limitWeeklyTriggered: false,
          limitMonthlyTriggered: false,
          activeLimit: null,
          limitCardMode: 'initial',
          showLimitDetails: false
        }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [limitsState.activeLimit, limitsState.limit5hrResetAt, limitsState.limitWeeklyResetAt, limitsState.limitMonthlyResetAt]);

  // Check limits based on entitlement - trigger ONLY when 100% exhausted
  useEffect(() => {
    if (!entitlement) return;

    // 5-hour limit check - trigger at 100% usage
    const usage5h = entitlement.usage5hPc ?? 0;
    const limit5h = entitlement.limit5hPc ?? Infinity;

    if (usage5h >= limit5h && limit5h !== Infinity && !limitsState.limit5hrTriggered) {
      setLimitsState(prev => ({
        ...prev,
        limit5hrTriggered: true,
        limit5hrResetAt: Date.now() + (5 * 60 * 60 * 1000), // 5 hours from now
        activeLimit: '5hr'
      }));
    }

    // Weekly limit check - trigger at 100% usage
    const usageWeekly = entitlement.usageWeeklyPc ?? 0;
    const limitWeekly = entitlement.limitWeeklyPc ?? Infinity;

    if (usageWeekly >= limitWeekly && limitWeekly !== Infinity && !limitsState.limitWeeklyTriggered) {
      setLimitsState(prev => ({
        ...prev,
        limitWeeklyTriggered: true,
        limitWeeklyResetAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
        activeLimit: 'weekly'
      }));
    }

    // Monthly limit check - trigger at 100% usage
    const monthlyResetDate = new Date();
    monthlyResetDate.setMonth(monthlyResetDate.getMonth() + 1);
    monthlyResetDate.setDate(1);
    monthlyResetDate.setHours(0, 0, 0, 0);

    if (!limitsState.limitMonthlyTriggered) {
      setLimitsState(prev => ({
        ...prev,
        limitMonthlyResetAt: monthlyResetDate.getTime()
      }));
    }
  }, [entitlement?.usage5hPc, entitlement?.limit5hPc, entitlement?.usageWeeklyPc, entitlement?.limitWeeklyPc, limitsState.limit5hrTriggered, limitsState.limitWeeklyTriggered]);

  const latestMessage = useMemo(() => snapshot.messages[snapshot.messages.length - 1], [snapshot.messages]);

  // Action narration (system lines) get appended just like any other
  // message — without this, they scroll out of view the moment the
  // transcript overflows its fixed height, so the user never actually
  // sees "Installing X…" / "Setting Y…" happen even though it's right
  // there in the DOM. Every new message — including in-place narration
  // updates from streaming to final — should keep the latest one in view.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snapshot.messages, snapshot.draftTranscript]);

  useEffect(() => {
    if (!snapshot.draftTranscript || (snapshot.state !== 'listening' && snapshot.state !== 'idle')) return;
    if (draft && draft !== lastSyncedVoiceDraftRef.current) return;
    setDraft(snapshot.draftTranscript);
    lastSyncedVoiceDraftRef.current = snapshot.draftTranscript;
    setWasPasted(false);
    requestAnimationFrame(resizeTextarea);
  }, [draft, snapshot.draftTranscript, snapshot.state]);
  // While performing an action, show what's actually happening ("Opening VS
  // Code…") instead of the generic "Performing action" — Desktop Status
  // should always name the real activity, not just the state machine's name for it.
  const latestSystemMessage = useMemo(
    () => [...snapshot.messages].reverse().find((m) => m.role === 'system'),
    [snapshot.messages]
  );
  const stateLabel =
    snapshot.state === 'performingAction' && latestSystemMessage
      ? (latestSystemMessage.task
          ? latestSystemMessage.task.actions[latestSystemMessage.task.actions.length - 1]?.inProgressText ?? latestSystemMessage.task.goal
          : latestSystemMessage.content)
      : conversationStateLabels[snapshot.state];

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const send = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    // If task is running and text is not empty, queue the message instead of sending
    if (snapshot.state === 'performingAction' && text) {
      const context: SubmittedInputContext | undefined = wasPasted ? { source: 'pasted' } : { projectId: windowCtx.context.project?.id };
      setQueuedMessage({ text, context });
      setDraft('');
      lastSyncedVoiceDraftRef.current = '';
      setWasPasted(false);
      requestAnimationFrame(resizeTextarea);
      return;
    }

    // Auto-activate persona if user requests support
    if (!supportPersona && isSupportRequest(text)) {
      const personaName = 'Support Specialist';
      setSupportPersona(personaName);
      setShowPersonaButton(false);
      // Persist persona to support_sessions
      const convId = conversationIdRef.current;
      if (convId) {
        getSupabaseClient().then(async (supabase) => {
          try {
            const { data } = await supabase.auth.getSession();
            const userId = data.session?.user?.id;
            if (userId) {
              await supabase.from('support_sessions').upsert({
                user_id: userId,
                conversation_id: convId,
                assigned_persona: personaName,
              });
            }
          } catch {}
        });
      }
    }
    onSendTranscript(text, wasPasted ? { source: 'pasted', projectId: windowCtx.context.project?.id } : { projectId: windowCtx.context.project?.id });
    setDraft('');
    lastSyncedVoiceDraftRef.current = '';
    setWasPasted(false);
    requestAnimationFrame(resizeTextarea);
  };

  const handleCancelQueue = () => {
    setQueuedMessage(null);
  };

  const handleInterruptQueue = () => {
    if (isInterrupting) return; // Already interrupting, prevent double-click
    setIsInterrupting(true);
    onCancel?.();
    // isInterrupting flag prevents auto-send during interrupt request
    // Will be cleared in auto-submit effect once state becomes terminal
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
    if (imageItem) {
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (file) void handleImageChosen(file);
      return;
    }
    const pasted = event.clipboardData.getData('text');
    if (pasted.length > PASTE_LENGTH_THRESHOLD) setWasPasted(true);
  };

  const handleAttachClick = () => {
    setAttachError(null);
    fileInputRef.current?.click();
  };

  const handleImageChosen = async (file: File) => {
    setAttachError(null);
    try {
      const imageDataUrl = await readImageAsDataUrl(file);
      onSendTranscript(`📎 ${file.name || 'pasted image'}`, { source: 'image', imageDataUrl });
    } catch {
      setAttachError('I could not read that image.');
    }
  };

  const handleFileChosen = async (file: File) => {
    setAttachError(null);
    const ext = getExtension(file.name);
    if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      void handleImageChosen(file);
      return;
    }
    if (!SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
      setAttachError(
        `I can only read plain text or image files right now (${[...SUPPORTED_FILE_EXTENSIONS, ...SUPPORTED_IMAGE_EXTENSIONS].join(', ')}).`
      );
      return;
    }

    const content = await file.text();
    const truncated = content.length > MAX_FILE_CHARS;
    const reasoningText = truncated
      ? `${content.slice(0, MAX_FILE_CHARS)}\n\n[Truncated — the file continues beyond this point.]`
      : content;

    onSendTranscript(`📎 ${file.name}`, { reasoningText, source: 'file' });
  };

  return (
    <section className={styles.panel} aria-label="Conversation panel">
      {/* Wake Word Display (Very Top) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', transition: 'color 0.15s ease', padding: '4px 8px' }} onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,1)'} onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'} title="Click to change wake word in Companion Studio">
            {wakeWord}
          </div>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', color: 'rgba(255,255,255,0.7)', fontSize: '16px', transition: 'color 0.15s ease', position: 'relative' }} onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.9)'} onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'} onClick={() => setHamburgerMenuOpen(!hamburgerMenuOpen)} type="button" title="Navigation menu">
            ≡
            {hamburgerMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', zIndex: 100, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', marginTop: '8px', width: '280px', maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {/* Navigation buttons */}
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <button style={{ padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: '4px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: '13px', transition: 'background 0.15s ease', fontWeight: '500' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">+ New</button>
                  <button style={{ padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: '4px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: '13px', transition: 'background 0.15s ease', fontWeight: '500' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">📁 Artifacts</button>
                  <button style={{ padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: '4px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: '13px', transition: 'background 0.15s ease', fontWeight: '500' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">⚙ Customize</button>
                  <div style={{ position: 'relative' }} ref={moreMenuRef}>
                    <button style={{ padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: '4px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: '13px', transition: 'background 0.15s ease', fontWeight: '500' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} onClick={() => setMoreMenuOpen(!moreMenuOpen)} type="button">▼ More</button>
                    {moreMenuOpen && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', minWidth: '140px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">Routines</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">Dispatch</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Work history section - empty initially, populated with real data */}
                <div style={{ padding: '12px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {/* Section header */}
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Sessions
                  </div>
                  {/* Sessions list - currently empty, will show real sessions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '60px', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '12px', textAlign: 'center', padding: '12px 8px' }} title="Start your first conversation to see sessions list">
                    Start a conversation
                  </div>
                </div>

                {/* User section */}
                <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.6)' }}>
                      {userEmail ? userEmail.charAt(0).toUpperCase() : 'T'}
                    </div>
                    <span>{userEmail ? userEmail.split('@')[0] : 'User'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>·</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{entitlement?.tier || 'Free'}</span>
                  </div>
                  <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s ease', color: 'rgba(255,255,255,0.6)' }} onMouseOver={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }} onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }} type="button" title="Report issue" onClick={() => setFeedbackModalOpen(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <circle cx="12" cy="10" r="6"/>
                      <path d="M12 4v-2M10 5l-1.5-1.5M14 5l1.5-1.5"/>
                      <line x1="12" y1="16" x2="12" y2="20"/>
                      <circle cx="10" cy="13" r="1" fill="currentColor"/>
                      <circle cx="12" cy="12.5" r="1" fill="currentColor"/>
                      <circle cx="14" cy="13" r="1" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', padding: '4px' }}>
          <button className={styles.closeBtn} onClick={onClose} type="button" style={{ opacity: 0.7, fontSize: 13 }}>
            ✕
          </button>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '6px', borderRadius: '4px', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', position: 'relative' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }} onClick={() => setThreeDotsMenuOpen(!threeDotsMenuOpen)} type="button" title="Menu">
            ⋮
            {threeDotsMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', minWidth: '180px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', marginTop: '8px' }}>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">📁 Files</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} onClick={() => { onOpenSidebar?.('background-tasks'); setThreeDotsMenuOpen(false); }} type="button">⏱ Background tasks</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">⤢ Open in</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">✎ Rename</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">📄 Transcript view</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">📦 Archive</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,100,100,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,100,100,0.1)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">🗑 Delete</button>
              </div>
            )}
          </button>
          {entitlement?.tier === 'go' && (
            <button
              onClick={() => setIncognitoMode(!incognitoMode)}
              type="button"
              title={incognitoMode ? 'Exit Incognito Mode' : 'Enter Incognito Mode'}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                opacity: incognitoMode ? 1 : 0.6,
                transition: 'opacity 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                marginTop: '4px'
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
              onMouseOut={(e) => e.currentTarget.style.opacity = incognitoMode ? '1' : '0.6'}
            >
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', stroke: 'currentColor', strokeWidth: 1 }}>
              <path d="M8.4 15.2L10.7 10.1C10.9 9.65 11.35 9.35 11.85 9.35H20.15C20.65 9.35 21.1 9.65 21.3 10.1L23.6 15.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7.9 16.05H24.1" strokeLinecap="round"/>
              <path d="M9.2 16.1C9.35 18.15 10.65 19.25 12.25 19.25C13.85 19.25 15.05 18.15 15.25 16.1" strokeLinecap="round"/>
              <path d="M16.75 16.1C16.95 18.15 18.15 19.25 19.75 19.25C21.35 19.25 22.65 18.15 22.8 16.1" strokeLinecap="round"/>
            </svg>
            </button>
          )}
        </div>
      </div>

      {/* Session Name Display - Line 2 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>💻</span>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.7)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {snapshot.messages.length > 0 ? `Conversation • ${new Date().toLocaleDateString()}` : 'New Conversation'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '6px', borderRadius: '4px', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }} onClick={() => { onOpenSidebar?.('terminal'); }} type="button" title="Terminal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M4 6h16v12H4z"/>
              <path d="M7 14l2-2 2 2M14 14l2-2 2 2"/>
            </svg>
          </button>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '6px', borderRadius: '4px', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }} onClick={() => { onOpenSidebar?.('worktree'); }} type="button" title="Work Tree">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M3 6h18v12H3z"/>
              <line x1="9" y1="6" x2="9" y2="18"/>
              <line x1="15" y1="6" x2="15" y2="18"/>
            </svg>
          </button>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '6px', borderRadius: '4px', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }} onClick={() => { onOpenSidebar?.('browser'); }} type="button" title="Browser">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M3 8h18v11H3z"/>
              <line x1="3" y1="8" x2="3" y2="6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: '6px', borderRadius: '4px', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', position: 'relative' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }} onClick={() => setThreeDotsMenuOpen(!threeDotsMenuOpen)} type="button" title="Menu">
            ⋮
            {threeDotsMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', minWidth: '180px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', marginTop: '8px' }}>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">📁 Files</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} onClick={() => { onOpenSidebar?.('background-tasks'); setThreeDotsMenuOpen(false); }} type="button">⏱ Background tasks</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">⤢ Open in</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">✎ Rename</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">📄 Transcript view</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">📦 Archive</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,100,100,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,100,100,0.1)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">🗑 Delete</button>
              </div>
            )}
          </button>
        </div>
      </div>

      <div className={styles.panelContent}>
        <div className={styles.chatArea}>

      {creditsNoticeTier && onDismissCreditsNotice && (
        <CreditsRequiredNotice
          tier={creditsNoticeTier}
          seatTier={creditsNoticeSeatTier}
          pooled={creditsNoticePooled ?? false}
          enterpriseContactAvailable={enterpriseContactAvailable}
          onDismiss={onDismissCreditsNotice}
          onUpgrade={onUpgrade}
          onBuyCompute={onBuyCompute}
          onContactSales={onContactSales}
          onContactAdmin={onContactAdmin}
          onRequestMoreCompute={onRequestMoreCompute}
          pawCreditsBalanceUsd={pawCreditsBalanceUsd}
          onUseCredits={onUseCredits}
          redeeming={redeemingCredits}
          redeemError={redeemCreditsError}
        />
      )}

      <div ref={transcriptRef} className={styles.transcript} role="log" aria-live="polite" aria-relevant="additions text">
        {snapshot.messages.length === 0 && (
          entitlement?.tier === 'go' ? (
            <div style={{ padding: '40px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
              <div style={{ maxWidth: '600px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '48px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '16px' }}>✨</div>
                <div style={{ fontSize: '24px', fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginBottom: '12px' }}>What's up next, {userEmail ? userEmail.split('@')[0] : 'Tharun'}?</div>

                <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6', marginBottom: '32px' }}>
                  <div>Get Pro to connect your</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '600' }}>Gmail, Google Drive, Slack,</div>
                  <div>and <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '600' }}>Google Calendar</span></div>
                  <div style={{ marginTop: '12px', color: 'rgba(255,255,255,0.6)' }}>for getting your daily tasks ready.</div>
                </div>

                <button
                  onClick={onUpgrade}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    padding: '12px 32px',
                    color: 'rgba(255,255,255,0.8)',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '32px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                  }}
                  type="button"
                >
                  ✨ Get Pro
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '32px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="4" width="20" height="16" rx="2" fill="#EA4335"/>
                      <path d="M22 4l-10 8L2 4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '32px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 2l7 12-7 12H2l7-12L2 2h6z" fill="#0F9D58"/>
                      <path d="M16 2l7 12-7 12h6l7-12-7-12h-6z" fill="#4285F4"/>
                      <path d="M8 14l8-12 8 12-8 12-8-12z" fill="#FBBC04"/>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '32px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="4" width="18" height="18" rx="2" fill="#4285F4"/>
                      <rect x="3" y="4" width="18" height="4" fill="#1F73E7"/>
                      <circle cx="12" cy="14" r="3" fill="white"/>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '32px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 2c-1.1 0-2 .9-2 2v3h3V4c0-1.1-.9-2-2-2zm0 8c-1.1 0-2 .9-2 2v3h3v-3c0-1.1-.9-2-2-2zm6-8c-1.1 0-2 .9-2 2v3h3V4c0-1.1-.9-2-2-2zm0 8c-1.1 0-2 .9-2 2v3h3v-3c0-1.1-.9-2-2-2zm6-8c-1.1 0-2 .9-2 2v3h3V4c0-1.1-.9-2-2-2zm0 8c-1.1 0-2 .9-2 2v3h3v-3c0-1.1-.9-2-2-2z" fill="#E01E5A"/>
                      <path d="M19 12c0-1.1-.9-2-2-2h-3v3h3c1.1 0 2-.9 2-2zm-8 0c0-1.1-.9-2-2-2H6v3h3c1.1 0 2-.9 2-2z" fill="#36C5F0"/>
                    </svg>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.6', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px' }}>
                  <div style={{ marginBottom: '8px' }}>🔒 Your data is private and secure.</div>
                  <div>Only you have access.</div>
                </div>

                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '24px' }}>One place. All your work. Powered by PawOS. 🐾</div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>Ready to start. Type or speak to PawOS.</div>
          )
        )}
        {supportPersona && (
          <div
            style={{
              padding: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: 12,
              fontWeight: 500,
              color: '#3b82f6',
            }}
          >
            ✓ {supportPersona} connected
          </div>
        )}
        {snapshot.messages.map((message) =>
          message.role === 'system' ? (
            message.task ? (
              <TaskCard
                key={message.id}
                task={message.task}
                onRetryAction={onRetryAction}
                onOpenPath={onOpenPath}
                onConnectCapability={onConnectCapability}
                onNavigateToSettingsConnector={onNavigateToSettingsConnector}
                onOpenTicketBalance={onOpenTicketBalance}
                onPlanDecision={onPlanDecision}
              />
            ) : (
              <div key={message.id} className={styles.systemLineWrap}>
                <div
                  className={`${styles.systemLine} ${message.status === 'streaming' ? styles.systemLineActive : styles.systemLineDone}`}
                >
                  <span className={styles.systemLineIcon}>{message.status === 'streaming' ? '⚙️' : '✓'}</span>
                  <span className={styles.systemLineText}>{message.content}</span>
                </div>
              </div>
            )
          ) : message.role === 'assistant' && message.status !== 'streaming' && !message.content.trim() ? (
            // A finished assistant turn with no narration text at all — the model made a
            // tool call and said nothing alongside it. The real record of what happened
            // already renders as its own TaskCard/system-line entry elsewhere in this same
            // list; rendering an empty "assistant" bubble here would only add a blank box
            // with no information, which is exactly the "I can't see what it's doing"
            // complaint this was fixed for. Skip it outright rather than showing nothing
            // inside a labeled box.
            null
          ) : (
            <React.Fragment key={message.id}>
              {message.role === 'assistant' && message.status !== 'streaming' && isProjectPlanMessage(message.content) ? (
                // A finished project-plan message renders only as the structured
                // card below — never also as a raw markdown-looking text bubble.
                // While still streaming, the raw bubble below is shown instead
                // (the card can't be built from a plan that's mid-generation).
                <ProjectPlanCard
                  content={message.content}
                  onBuild={() => onSendTranscript('Build Project from the approved PROJECT PLAN.')}
                  onModify={() => onSendTranscript('Modify Plan. I want to adjust the PROJECT PLAN before building.')}
                  onAccept={() => onSendTranscript('I approve this plan as written.')}
                  onDeny={() => onSendTranscript('I reject this plan and would like a different approach.')}
                />
              ) : (
                <article
                  className={`${styles.message} ${message.role === 'assistant' ? styles.assistant : styles.user}`}
                >
                  <div className={styles.messageHeader}>
                    <span className={styles.role}>{message.role}</span>
                    {message.role === 'assistant' && message.status !== 'streaming' && message.content.trim() && (
                      <button className={styles.speakMessageBtn} onClick={() => onSpeakMessage(message.content)} type="button">
                        Speak
                      </button>
                    )}
                  </div>
                  <div className={message.status === 'streaming' ? styles.streaming : ''}>{message.content}</div>
                  {message.extensions && message.extensions.length > 0 && (
                    <ExtensionRenderer
                      extensions={message.extensions}
                      onExpand={(request) => handleExtensionExpand(request)}
                      onAction={(extensionId, action, payload) =>
                        handleExtensionAction(extensionId, action, payload)
                      }
                    />
                  )}
                </article>
              )}
            </React.Fragment>
          )
        )}
        {snapshot.draftTranscript && snapshot.state === 'listening' && (
          <article className={`${styles.message} ${styles.user}`}>
            <div className={styles.role}>user</div>
            <div className={styles.streaming}>{snapshot.draftTranscript}</div>
          </article>
        )}
        {!snapshot.draftTranscript && latestMessage?.role === 'assistant' && snapshot.state === 'speaking' && (
          <div className={styles.speakingHint}>Speaking response...</div>
        )}
      </div>

      {/* Live Work Stream — shown while CURRENT TASK is active (planning/executing/waiting for approval)
           Disappears only when task reaches terminal state (completed/failed/interrupted) */}
      {(() => {
        // Show stream while task is active (planning, executing, waiting for permission/approval)
        // Hide only when task is done or never started
        const hasActiveTask = snapshot.state !== 'idle' && snapshot.state !== 'listening' && snapshot.state !== 'completed' && snapshot.state !== 'error' && snapshot.state !== 'interrupted';
        const currentActions = snapshot.messages
          .filter((m) => m.task)
          .flatMap((m) => m.task?.actions || [])
          .filter((a) => a);

        return hasActiveTask && (
          <LiveWorkStream
            actions={currentActions}
            isRunning={snapshot.state === 'performingAction'}
            showActivityDot={snapshot.state === 'performingAction' || snapshot.state === 'thinking'}
          />
        );
      })()}

      <LiveStatus
        status={snapshot.state === 'thinking' ? 'thinking' : snapshot.state === 'performingAction' ? 'running-commands' : 'idle'}
        isActive={isStreaming}
        pawComputesUsed={streamingPawCompute}
        elapsedSeconds={streamingElapsedSeconds}
      />

      {snapshot.errorMessage && <div className={styles.error}>{snapshot.errorMessage}</div>}
      {attachError && <div className={styles.error}>{attachError}</div>}

      {/* Limits Card - Shows when limit approaching/reached */}
      {limitsState.limit5hrTriggered && (
        <div style={{ margin: '16px', padding: '16px', background: 'rgba(248, 113, 113, 0.08)', border: '1px solid rgba(248, 113, 113, 0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(248, 113, 113, 0.9)', marginBottom: 6 }}>
              🔴 You've reached 5hr pawos {entitlement?.tier} limit. Resets in {limitsState.countdownTime}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 8 }}>
              You've used all your 5-hour rolling window allowance. Purchase credits to continue working, or wait until the timer resets.
            </div>
            {creditsUsage.pcsUsedThisSession > 0 && (
              <div style={{ fontSize: '12px', color: 'rgba(76, 175, 80, 0.8)', fontWeight: 500 }}>
                Credits used: {creditsUsage.pcsUsedThisSession} PC = ${calculateDollarFromPC(creditsUsage.pcsUsedThisSession)}
              </div>
            )}
          </div>

          {/* Fuel Bar Indicator */}
          <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, rgba(248, 113, 113, 0.8) 0%, rgba(248, 113, 113, 0.4) 100%)', width: '100%' }} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setLimitsState(prev => ({ ...prev, showLimitDetails: true }))}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: '4px',
                color: 'rgba(248, 113, 113, 0.8)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.5)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.3)';
              }}
              type="button"
            >
              View Details
            </button>
            <button
              onClick={() => {
                // Resume work after reset or purchase
                setLimitsState(prev => ({ ...prev, limit5hrTriggered: false }));
                conversation.open();
              }}
              style={{
                padding: '8px 16px',
                background: 'rgba(77, 167, 255, 0.2)',
                border: '1px solid rgba(77, 167, 255, 0.4)',
                borderRadius: '4px',
                color: 'rgba(77, 167, 255, 0.9)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(77, 167, 255, 0.3)';
                e.currentTarget.style.borderColor = 'rgba(77, 167, 255, 0.6)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(77, 167, 255, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(77, 167, 255, 0.4)';
              }}
              type="button"
            >
              Try Again (Wait for Reset)
            </button>
            <button
              onClick={() => {
                // Buy $5 credits and resume
                setCreditsUsage(prev => ({
                  ...prev,
                  dollarBought: prev.dollarBought + 5
                }));
                setLimitsState(prev => ({ ...prev, limit5hrTriggered: false }));
                conversation.open();
              }}
              style={{
                padding: '8px 16px',
                background: 'rgba(76, 175, 80, 0.2)',
                border: '1px solid rgba(76, 175, 80, 0.4)',
                borderRadius: '4px',
                color: 'rgba(76, 175, 80, 0.9)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(76, 175, 80, 0.3)';
                e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.6)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(76, 175, 80, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.4)';
              }}
              type="button"
            >
              Buy Credits ($5 min)
            </button>
          </div>
        </div>
      )}

      {/* Weekly Limit Card */}
      {limitsState.limitWeeklyTriggered && (
        <div style={{ margin: '16px', padding: '16px', background: 'rgba(255, 193, 7, 0.08)', border: '1px solid rgba(255, 193, 7, 0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255, 193, 7, 0.9)', marginBottom: 6 }}>
              🟡 You've reached weekly pawos {entitlement?.tier} limit. Resets in {limitsState.countdownTime}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 8 }}>
              You've used all your weekly allowance. Purchase credits to continue working, or wait until the timer resets.
            </div>
            {creditsUsage.pcsUsedThisSession > 0 && (
              <div style={{ fontSize: '12px', color: 'rgba(76, 175, 80, 0.8)', fontWeight: 500 }}>
                Credits used: {creditsUsage.pcsUsedThisSession} PC = ${calculateDollarFromPC(creditsUsage.pcsUsedThisSession)}
              </div>
            )}
          </div>
          <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, rgba(255, 193, 7, 0.8) 0%, rgba(255, 193, 7, 0.4) 100%)', width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setLimitsState(prev => ({ ...prev, showLimitDetails: true }))} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(255, 193, 7, 0.3)', borderRadius: '4px', color: 'rgba(255, 193, 7, 0.8)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, transition: 'all 0.15s ease' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 193, 7, 0.1)'; e.currentTarget.style.borderColor = 'rgba(255, 193, 7, 0.5)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255, 193, 7, 0.3)'; }} type="button">View Details</button>
            <button onClick={() => { setLimitsState(prev => ({ ...prev, limitWeeklyTriggered: false })); conversation.open(); }} style={{ padding: '8px 16px', background: 'rgba(77, 167, 255, 0.2)', border: '1px solid rgba(77, 167, 255, 0.4)', borderRadius: '4px', color: 'rgba(77, 167, 255, 0.9)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, transition: 'all 0.15s ease' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(77, 167, 255, 0.3)'; e.currentTarget.style.borderColor = 'rgba(77, 167, 255, 0.6)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(77, 167, 255, 0.2)'; e.currentTarget.style.borderColor = 'rgba(77, 167, 255, 0.4)'; }} type="button">Try Again (Wait for Reset)</button>
            <button onClick={() => { setCreditsUsage(prev => ({ ...prev, dollarBought: prev.dollarBought + 5 })); setLimitsState(prev => ({ ...prev, limitWeeklyTriggered: false })); conversation.open(); }} style={{ padding: '8px 16px', background: 'rgba(76, 175, 80, 0.2)', border: '1px solid rgba(76, 175, 80, 0.4)', borderRadius: '4px', color: 'rgba(76, 175, 80, 0.9)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, transition: 'all 0.15s ease' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(76, 175, 80, 0.3)'; e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.6)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(76, 175, 80, 0.2)'; e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.4)'; }} type="button">Buy Credits ($5 min)</button>
          </div>
        </div>
      )}

      {/* Monthly Limit Card */}
      {limitsState.limitMonthlyTriggered && (
        <div style={{ margin: '16px', padding: '16px', background: 'rgba(244, 67, 54, 0.08)', border: '1px solid rgba(244, 67, 54, 0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(244, 67, 54, 0.9)', marginBottom: 6 }}>
              🔴 You've reached monthly pawos {entitlement?.tier} limit. Resets in {limitsState.countdownTime}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: 8 }}>
              You've used all your monthly allowance. Purchase credits to continue working. Monthly resets at next billing cycle.
            </div>
            {creditsUsage.pcsUsedThisSession > 0 && (
              <div style={{ fontSize: '12px', color: 'rgba(76, 175, 80, 0.8)', fontWeight: 500 }}>
                Credits used: {creditsUsage.pcsUsedThisSession} PC = ${calculateDollarFromPC(creditsUsage.pcsUsedThisSession)}
              </div>
            )}
          </div>
          <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, rgba(244, 67, 54, 0.8) 0%, rgba(244, 67, 54, 0.4) 100%)', width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setLimitsState(prev => ({ ...prev, showLimitDetails: true }))} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(244, 67, 54, 0.3)', borderRadius: '4px', color: 'rgba(244, 67, 54, 0.8)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, transition: 'all 0.15s ease' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244, 67, 54, 0.1)'; e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.5)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.3)'; }} type="button">View Details</button>
            <button onClick={() => { setCreditsUsage(prev => ({ ...prev, pcsUsedThisSession: prev.pcsUsedThisSession + 500, dollarUsedThisSession: prev.dollarUsedThisSession + 5 })); setLimitsState(prev => ({ ...prev, limitMonthlyTriggered: false })); conversation.open(); }} style={{ padding: '8px 16px', background: 'rgba(76, 175, 80, 0.2)', border: '1px solid rgba(76, 175, 80, 0.4)', borderRadius: '4px', color: 'rgba(76, 175, 80, 0.9)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, transition: 'all 0.15s ease' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(76, 175, 80, 0.3)'; e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.6)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(76, 175, 80, 0.2)'; e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.4)'; }} type="button">💳 Buy Credits ($5 min) - MANDATORY</button>
          </div>
        </div>
      )}

      {/* Limits Details Modal */}
      {limitsState.showLimitDetails && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setLimitsState(prev => ({ ...prev, showLimitDetails: false }))}>
          <div style={{ background: 'rgba(248, 113, 113, 0.15)', border: '1px solid rgba(248, 113, 113, 0.4)', borderRadius: '12px', padding: '28px', maxWidth: '520px', width: '90%', boxShadow: '0 20px 60px rgba(248, 113, 113, 0.2)' }} onClick={(e) => e.stopPropagation()}>
            {/* Red Caution Header */}
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'rgba(255,255,255,0.95)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              {limitsState.activeLimit === '5hr' ? '5-Hour' : limitsState.activeLimit === 'weekly' ? 'Weekly' : 'Monthly'} Limit Reached
            </div>

            {/* Countdown Timer - RED BACKGROUND */}
            <div style={{ padding: '16px', background: 'rgba(248, 113, 113, 0.25)', borderRadius: '8px', border: '1px solid rgba(248, 113, 113, 0.5)', marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px', fontWeight: 600 }}>Resets in</div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: 'rgba(255,255,255,0.95)', fontFamily: 'monospace' }}>
                {limitsState.countdownTime}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Try Again - Disabled (Red) until reset */}
              <button
                disabled
                style={{
                  padding: '12px 16px',
                  background: 'rgba(248, 113, 113, 0.3)',
                  border: '1px solid rgba(248, 113, 113, 0.5)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.9)',
                  cursor: 'not-allowed',
                  fontSize: '13px',
                  fontWeight: 600,
                  opacity: 0.6
                }}
                type="button"
              >
                Try Again
              </button>

              {/* Get Credits - Only show in initial mode */}
              {limitsState.limitCardMode === 'initial' && (
                <button
                  onClick={() => {}}
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(76, 175, 80, 0.3)',
                    border: '1px solid rgba(76, 175, 80, 0.5)',
                    borderRadius: '6px',
                    color: 'rgba(76, 175, 80, 0.9)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    transition: 'all 0.15s ease'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(76, 175, 80, 0.4)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(76, 175, 80, 0.3)';
                  }}
                  type="button"
                >
                  Get Credits
                </button>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => setLimitsState(prev => ({ ...prev, showLimitDetails: false }))}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              }}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* 9 Limit Bars - 3 for each limit type (5hrs, weekly, monthly) at 30%, 15%, 0% thresholds */}
      {(() => {
        const limits = [
          { type: '5hr', usage: entitlement?.usage5hPc || 0, limit: entitlement?.limit5hPc || 1, label: '5hrs' },
          { type: 'weekly', usage: entitlement?.usageWeeklyPc || 0, limit: entitlement?.limitWeeklyPc || 1, label: 'weekly' },
          { type: 'monthly', usage: entitlement?.usageMonthlyPc || 0, limit: entitlement?.limitMonthlyPc || 1, label: 'monthly' }
        ];

        const bars: React.ReactNode[] = [];

        limits.forEach(({ type, usage, limit, label }) => {
          const remainingPercent = Math.max(0, Math.round(100 - (usage / limit) * 100));
          const isAtLimit = remainingPercent <= 0;
          const isAt15 = remainingPercent <= 15 && remainingPercent > 0;
          const isAt30 = remainingPercent <= 30 && remainingPercent > 15;

          // Show bar at 30% remaining
          if (isAt30 && !limitsState.closedBars[`${type}-30`]) {
            bars.push(
              <div key={`${type}-30`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', borderBottom: '1px solid rgba(255, 193, 7, 0.3)',
                minHeight: '40px', backgroundColor: 'rgba(255, 193, 7, 0.05)'
              }}>
                <span style={{ color: 'rgba(255, 193, 7, 0.9)', fontSize: '13px', fontWeight: 600, flex: 1 }}>
                  ⚠️ Approaching limit 30% remaining on {label}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setLimitsState(prev => ({ ...prev, showLimitDetails: true }))}
                    style={{
                      background: 'rgba(76, 175, 80, 0.3)', border: '1px solid rgba(76, 175, 80, 0.5)',
                      borderRadius: '4px', padding: '6px 14px', color: 'rgba(76, 175, 80, 0.9)',
                      cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap'
                    }} type="button">Get Credits</button>
                  <button onClick={() => setLimitsState(prev => ({ ...prev, closedBars: { ...prev.closedBars, [`${type}-30`]: true } }))}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(255, 193, 7, 0.7)',
                      cursor: 'pointer', fontSize: '16px', padding: '0 8px' }} type="button">×</button>
                </div>
              </div>
            );
          }

          // Show bar at 15% remaining
          if (isAt15 && !limitsState.closedBars[`${type}-15`]) {
            bars.push(
              <div key={`${type}-15`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', borderBottom: '1px solid rgba(255, 193, 7, 0.3)',
                minHeight: '40px', backgroundColor: 'rgba(255, 193, 7, 0.05)'
              }}>
                <span style={{ color: 'rgba(255, 193, 7, 0.9)', fontSize: '13px', fontWeight: 600, flex: 1 }}>
                  ⚠️ Approaching limit 15% remaining on {label}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setLimitsState(prev => ({ ...prev, showLimitDetails: true }))}
                    style={{
                      background: 'rgba(76, 175, 80, 0.3)', border: '1px solid rgba(76, 175, 80, 0.5)',
                      borderRadius: '4px', padding: '6px 14px', color: 'rgba(76, 175, 80, 0.9)',
                      cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap'
                    }} type="button">Get Credits</button>
                  <button onClick={() => setLimitsState(prev => ({ ...prev, closedBars: { ...prev.closedBars, [`${type}-15`]: true } }))}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(255, 193, 7, 0.7)',
                      cursor: 'pointer', fontSize: '16px', padding: '0 8px' }} type="button">×</button>
                </div>
              </div>
            );
          }

          // Show bar at 0% remaining (RED, locks search)
          if (isAtLimit && !limitsState.closedBars[`${type}-0`]) {
            bars.push(
              <div key={`${type}-0`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', borderBottom: '1px solid rgba(248, 113, 113, 0.5)',
                minHeight: '40px', backgroundColor: 'rgba(248, 113, 113, 0.2)'
              }}>
                <span style={{ color: 'rgba(248, 113, 113, 0.95)', fontSize: '13px', fontWeight: 600, flex: 1 }}>
                  ⚠️ Approaching limit 0% remaining on {label}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setLimitsState(prev => ({ ...prev, showLimitDetails: true }))}
                    style={{
                      background: 'rgba(76, 175, 80, 0.3)', border: '1px solid rgba(76, 175, 80, 0.5)',
                      borderRadius: '4px', padding: '6px 14px', color: 'rgba(76, 175, 80, 0.9)',
                      cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap'
                    }} type="button">Get Credits</button>
                  <button onClick={() => setLimitsState(prev => ({ ...prev, closedBars: { ...prev.closedBars, [`${type}-0`]: true } }))}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(248, 113, 113, 0.8)',
                      cursor: 'pointer', fontSize: '16px', padding: '0 8px' }} type="button">×</button>
                </div>
              </div>
            );
          }
        });

        return bars;
      })()}

      {/* Working State Info Bar - Shows folder, branch, edits, Create PR (only when working) */}
      {activeTask && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: '36px', backgroundColor: 'rgba(77,167,255,0.03)' }}>
          {/* Left: Folder + Branch + Git Status */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
              <span>src/renderer/conversation</span>
              <span>main</span>
              {!activeTask?.gitConnected && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 8px', background: 'rgba(255,165,0,0.1)', borderRadius: '3px', border: '1px solid rgba(255,165,0,0.2)', cursor: 'pointer' }} title="Connect your git to enable easy push and pull">
                  <span style={{ fontSize: '12px', color: 'rgba(255,165,0,0.8)' }}>⚠</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,165,0,0.7)' }}>connect git</span>
                </div>
              )}
            </div>
            {/* Line Edits */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '12px', fontWeight: 500 }}>
              <span style={{ color: '#4ade80' }}>+200</span>
              <span style={{ color: '#f87171' }}>-40</span>
            </div>
          </div>

          {/* Right: Create PR Menu + Close */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }} ref={prMenuRef}>
            <button
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '4px',
                cursor: 'pointer',
                padding: '5px 10px',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '11px',
                fontWeight: 500,
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
              }}
              onClick={() => setPrMenuOpen(!prMenuOpen)}
              type="button"
            >
              Create PR ▼
            </button>
            {prMenuOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                background: 'rgba(12,12,16,0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                minWidth: '200px',
                zIndex: 100,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(12px)',
              }}>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">Manually create a PR</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">Create a draft PR</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">Create PR</button>
              </div>
            )}
            <button
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px 6px',
                transition: 'color 0.15s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
              onClick={() => {}}
              type="button"
              title="Close working state"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className={styles.composer}>
        <input
          ref={fileInputRef}
          type="file"
          accept={[...SUPPORTED_FILE_EXTENSIONS, ...SUPPORTED_IMAGE_EXTENSIONS].join(',')}
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFileChosen(file);
            event.target.value = '';
          }}
        />

        {/* Top row: Attach, Mode Picker, Execute Mode */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className={styles.attachBtn}
            onClick={handleAttachClick}
            title="Attach a text file or reference image for Paw to read"
            aria-label="Attach a file or image"
          >
            📎
          </button>
          <div className={styles.modePickerWrap} ref={modeMenuRef}>
            <button
              type="button"
              className={styles.modePickerBtn}
              onClick={() => setModeMenuOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={modeMenuOpen}
              title="Execution mode — controls when Paw asks before acting"
            >
              <span>{activeModeDescriptor.label}</span>
              <span className={styles.modePickerChevron}>{modeMenuOpen ? '▴' : '▾'}</span>
            </button>
            {modeMenuOpen && (
              <div className={styles.modePickerMenu} role="listbox">
                {EXECUTION_MODE_CATALOG.map((mode) => {
                  const disabled = mode.id === 'bypass' && !bypassPermissionsEnabled;
                  const selected = mode.id === activeExecutionMode;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={disabled}
                      className={`${styles.modePickerOption} ${selected ? styles.modePickerOptionSelected : ''}`}
                      onClick={() => {
                        if (disabled) return;
                        onSetExecutionMode?.(mode.id);
                        setModeMenuOpen(false);
                      }}
                    >
                      <span className={styles.modePickerOptionCheck}>{selected ? '✓' : ''}</span>
                      <span className={styles.modePickerOptionText}>
                        <span className={styles.modePickerOptionLabel}>{mode.label}</span>
                        <span className={styles.modePickerOptionDesc}>
                          {disabled ? 'Enable in Settings → Advanced' : mode.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chat bar with Input + Controls - Clean modern design with left/right spacing */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '0 16px', paddingBottom: '12px' }}>

          {/* Resume button (Speech output) */}
          {snapshot.speechPlaybackState === 'paused' && (
            <button
              type="button"
              className={styles.listenBtn}
              onClick={() => {
                const msg = latestMessage;
                if (msg && msg.role === 'assistant') {
                  onSpeakMessage(msg.content);
                }
              }}
              title="Resume speech output"
              style={{ fontSize: '14px', flexShrink: 0 }}
            >
              ▶️
            </button>
          )}

          {/* Send button - LEFT side (disabled only when limit reaches 0%) */}
          {(() => {
            const is5hrAtLimit = !!(entitlement?.usage5hPc && entitlement?.limit5hPc && (entitlement.usage5hPc / entitlement.limit5hPc) >= 1);
            const isWeeklyAtLimit = !!(entitlement?.usageWeeklyPc && entitlement?.limitWeeklyPc && (entitlement.usageWeeklyPc / entitlement.limitWeeklyPc) >= 1);
            const isMonthlyAtLimit = !!(entitlement?.usageMonthlyPc && entitlement?.limitMonthlyPc && (entitlement.usageMonthlyPc / entitlement.limitMonthlyPc) >= 1);
            const isAnyAtLimit = is5hrAtLimit || isWeeklyAtLimit || isMonthlyAtLimit;

            return (
              <button
                className={styles.sendBtn}
                onClick={send}
                type="button"
                disabled={isAnyAtLimit}
                style={{
                  background: isAnyAtLimit ? 'rgba(248,113,113,0.2)' : draft.trim() ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  opacity: isAnyAtLimit ? 0.5 : 1,
                  cursor: isAnyAtLimit ? 'not-allowed' : 'pointer',
                  order: -1
                }}
                title={isAnyAtLimit ? 'Send disabled - limit reached (0%). Buy credits or wait for reset.' : 'Send message'}
              >
                Send
              </button>
            );
          })()}

          {/* Text input - takes available space, clean and prominent */}
          <textarea
            ref={textareaRef}
            className={styles.input}
            rows={1}
            autoFocus
            value={draft}
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              if (!text) setWasPasted(false);

              // Line-counting logic for large prompt detection
              if (text.trim()) {
                const lineCount = text.split('\n').length;
                // Store line count in data attr for later use (if >700 lines)
                if (textareaRef.current) {
                  textareaRef.current.setAttribute('data-line-count', String(lineCount));
                }
              }

              resizeTextarea();
            }}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Type or describe what you need"
            style={{ flex: 1, minWidth: 0 }}
          />

          {/* Microphone button - RIGHT side, records and transcribes */}
          <button
            type="button"
            onClick={() => {
              setVoiceState(prev => ({ ...prev, isRecording: !prev.isRecording }));
            }}
            style={{
              background: voiceState.isRecording ? 'rgba(248, 113, 113, 0.2)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 8px',
              fontSize: '16px',
              color: voiceState.isRecording ? 'rgba(248, 113, 113, 0.9)' : 'rgba(255,255,255,0.6)',
              transition: 'all 0.15s ease',
              borderRadius: '4px',
              flexShrink: 0
            }}
            onMouseOver={(e) => !voiceState.isRecording && (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseOut={(e) => !voiceState.isRecording && (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            title={voiceState.isRecording ? 'Recording... (click to stop)' : 'Record audio (will be transcribed)'}
          >
            🎤
          </button>

          {/* Speaker button - RIGHT side, toggles voice output */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => {
                if (voiceState.speakerEnabled) {
                  setVoiceState(prev => ({ ...prev, speakerEnabled: false, autoSend: false }));
                } else {
                  setVoiceState(prev => ({ ...prev, showSpeakerMenu: true }));
                }
              }}
              style={{
                background: voiceState.speakerEnabled ? 'rgba(77, 167, 255, 0.2)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 8px',
                fontSize: '16px',
                color: voiceState.speakerEnabled ? 'rgba(77, 167, 255, 0.9)' : 'rgba(255,255,255,0.6)',
                transition: 'all 0.15s ease',
                borderRadius: '4px',
                flexShrink: 0
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = voiceState.speakerEnabled ? 'rgba(77, 167, 255, 0.9)' : 'rgba(255,255,255,0.8)')}
              onMouseOut={(e) => (e.currentTarget.style.color = voiceState.speakerEnabled ? 'rgba(77, 167, 255, 0.9)' : 'rgba(255,255,255,0.6)')}
              title={voiceState.speakerEnabled ? `Speaker ON (2x PC cost, ${voiceState.autoSend ? 'auto-send' : 'manual send'})` : 'Speaker OFF (click to enable)'}
            >
              🔊
            </button>

            {/* Speaker options menu */}
            {voiceState.showSpeakerMenu && (
              <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '8px', background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(77,167,255,0.2)', borderRadius: '8px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', minWidth: '220px', padding: '8px' }}>
                <button
                  onClick={() => {
                    setVoiceState(prev => ({ ...prev, speakerEnabled: true, autoSend: true, showSpeakerMenu: false }));
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'rgba(255,255,255,0.8)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '12px',
                    marginBottom: '4px',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(77,167,255,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  type="button"
                >
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>✓ Auto-send</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Pawos sends everything automatically (2x PC cost)</div>
                </button>
                <button
                  onClick={() => {
                    setVoiceState(prev => ({ ...prev, speakerEnabled: true, autoSend: false, showSpeakerMenu: false }));
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'rgba(255,255,255,0.8)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '12px',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(77,167,255,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  type="button"
                >
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>◯ Manual send</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>You click Send for each message (2x PC cost)</div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inline Message Queue — shows when message queued during task execution */}
        {queuedMessage && (
          <div style={{
            background: 'rgba(77, 167, 255, 0.1)',
            border: '1px solid rgba(77, 167, 255, 0.3)',
            borderRadius: '6px',
            padding: '8px 12px',
            marginTop: '8px',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', color: 'rgba(77, 167, 255, 0.9)', marginBottom: '4px', fontWeight: 500 }}>Queued message:</div>
              <div style={{
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.8)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {queuedMessage.text}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={handleCancelQueue}
                type="button"
                title="Cancel (remove from queue)"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '14px',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 100, 100, 0.2)';
                  e.currentTarget.style.color = 'rgba(255, 100, 100, 0.9)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                }}
              >
                ×
              </button>
              <button
                onClick={handleInterruptQueue}
                type="button"
                title="Interrupt current task and send queued message"
                style={{
                  background: 'rgba(255, 165, 0, 0.1)',
                  border: '1px solid rgba(255, 165, 0, 0.3)',
                  borderRadius: '4px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'rgba(255, 165, 0, 0.7)',
                  fontSize: '14px',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 165, 0, 0.2)';
                  e.currentTarget.style.color = 'rgba(255, 165, 0, 0.9)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 165, 0, 0.1)';
                  e.currentTarget.style.color = 'rgba(255, 165, 0, 0.7)';
                }}
              >
                ⏹
              </button>
            </div>
          </div>
        )}

        {/* Toolbar: Clean compact bottom toolbar with only essential controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '8px', gap: '12px', minHeight: '28px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
            {/* Add Menu - Compact */}
            <div style={{ position: 'relative' }} ref={addMenuRef}>
              <button
                onClick={() => setAddMenuOpen(!addMenuOpen)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: '14px', padding: '4px 8px', borderRadius: '4px', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                type="button"
                title="Add files or enable features"
              >
                +
              </button>
              {addMenuOpen && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', minWidth: '200px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', padding: '8px' }}>
                  <button style={{ display: 'flex', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease', alignItems: 'center', gap: '8px' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, stroke: 'rgba(255,255,255,0.7)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    Add files or photos
                  </button>
                  <button style={{ display: 'flex', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease', alignItems: 'center', gap: '8px' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, stroke: 'rgba(255,255,255,0.7)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      <path d="M12 11v6M9 14h6"/>
                    </svg>
                    Add folder
                  </button>
                  <div style={{ position: 'relative' }} ref={slashMenuRef}>
                    <button
                      onClick={() => setSlashCommandsMenuOpen(!slashCommandsMenuOpen)}
                      style={{ display: 'flex', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease', alignItems: 'center', gap: '8px' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                      type="button"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, stroke: 'rgba(255,255,255,0.7)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                        <path d="M6 19l12-14"/>
                        <path d="M14 6H20V14H14Z"/>
                        <line x1="16" y1="9" x2="18" y2="9"/>
                      </svg>
                      Slash commands
                    </button>
                    {slashCommandsMenuOpen && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', minWidth: '200px', maxHeight: '400px', overflowY: 'auto', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', padding: '8px' }}>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/new - New chat</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/cd sandbox - Sandbox</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/last session - Last session</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/last edits - Last edits</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/recent edits - Recent edits</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/first edit - First edit</button>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/rename - Rename session</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/model - Select model</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/wake word - Change wake word</button>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/get credits - Check credits</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/get usage - Check usage</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/get billing - Billing info</button>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/feedback - Send feedback</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/report - Report issue</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/help - Help</button>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/color code - Color coding</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/review - Code review</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/plan - Planning</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/analytics - Analytics</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/architect - Architecture</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/compose - Compose</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/create pr - Create PR</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/deploy - Deploy</button>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/comment in slack - Slack</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/comment in git - Git comment</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/comment in jira - Jira comment</button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">/comment in linear - Linear comment</button>
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'relative' }} ref={connectorsMenuRef}>
                    <button
                      onClick={() => setConnectorsSubmenuOpen(!connectorsSubmenuOpen)}
                      style={{ display: 'flex', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                      type="button"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, stroke: 'rgba(255,255,255,0.7)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                          <path d="M3 5h14v10H3z"/>
                          <polyline points="7 8 9 10 7 12"/>
                          <polyline points="11 8 13 10 11 12"/>
                          <rect x="12" y="13" width="3" height="5" rx="0.5"/>
                          <circle cx="13.5" cy="14.5" r="0.5" fill="rgba(255,255,255,0.7)"/>
                          <circle cx="13.5" cy="17" r="0.5" fill="rgba(255,255,255,0.7)"/>
                        </svg>
                        Connectors
                      </div>
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>▶</span>
                    </button>
                    {connectorsSubmenuOpen && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', minWidth: '200px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', padding: '8px' }}>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">
                          Manage connectors
                        </button>
                        <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">
                          Browse connectors
                        </button>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                        {getTierAppropriateConnectors(entitlement?.tier).map((connector) => (
                          <button key={connector} style={{ display: 'flex', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease', alignItems: 'center', gap: '8px' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">
                            {getConnectorIcon(connector)}
                            <span>{connector}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }} ref={modelMenuRef}>
            <button
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '12px', padding: 0, transition: 'color 0.15s ease' }}
              onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
              type="button"
            >
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: `conic-gradient(${pawCreditsBalanceUsd && pawCreditsBalanceUsd > 50 ? 'rgba(59, 130, 246, 0.7)' : pawCreditsBalanceUsd && pawCreditsBalanceUsd > 20 ? 'rgba(245, 158, 11, 0.7)' : 'rgba(239, 68, 68, 0.7)'} ${pawCreditsBalanceUsd ? Math.min((pawCreditsBalanceUsd / 100) * 100, 100) : 0}%, rgba(255,255,255,0.1) 0%)`, border: '1px solid rgba(255,255,255,0.12)' }} />
              <span>{activePawModel ? getPawModel(activePawModel)?.label : 'PawOS'}</span>
            </button>
            {modelMenuOpen && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', minWidth: '180px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', padding: '8px' }}>
                {REASONING_PAW_MODEL_IDS.map((modelId) => {
                  const model = PAW_MODEL_CATALOG.find(m => m.id === modelId);
                  if (!model) return null;
                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        onSelectModel?.(model.id);
                        setModelMenuOpen(false);
                      }}
                      style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: activePawModel === model.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderRadius: '4px', transition: 'background 0.15s ease', fontWeight: activePawModel === model.id ? '600' : '400' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                      type="button"
                    >
                      <span>{activePawModel === model.id ? '✓ ' : ''}{model.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ActivitySidebar
        activities={activities}
        selectedActivityId={selectedActivityId}
        onSelectActivity={setSelectedActivityId}
        onCloseDetail={() => setSelectedActivityId(null)}
      />
      </div>

      {/* Plan Proposal Banner - Paid Tiers Only (Pro, Pro Max, Team, Enterprise) */}
      {proposedPlan && entitlement?.tier && ['pro', 'pro_max', 'team', 'enterprise'].includes(entitlement.tier) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(77,167,255,0.08)', borderBottom: '1px solid rgba(77,167,255,0.15)', minHeight: '40px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: 'rgba(77,167,255,0.7)', fontWeight: '600' }}>🔵 PawOS proposed a plan</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(77,167,255,0.95)', marginTop: '2px' }}>{proposedPlan.name}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => setProposedPlan(null)}
              style={{ padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '11px', fontWeight: '600', transition: 'all 0.15s ease' }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
              type="button"
            >
              Deny
            </button>
            <button
              onClick={() => { setProposedPlan({ ...proposedPlan, status: 'revising' }); setShowPlanSidebar(true); }}
              style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '11px', fontWeight: '600', transition: 'all 0.15s ease' }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              type="button"
            >
              Revise
            </button>
            <button
              onClick={() => { setProposedPlan({ ...proposedPlan, status: 'accepted' }); }}
              style={{ padding: '6px 14px', background: 'rgba(77,167,255,0.2)', border: '1px solid rgba(77,167,255,0.4)', borderRadius: '4px', color: 'rgba(77,167,255,0.9)', cursor: 'pointer', fontSize: '11px', fontWeight: '600', transition: 'all 0.15s ease' }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(77,167,255,0.3)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(77,167,255,0.2)'; }}
              type="button"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {/* Plan Review Mode - Chat bar opens for revisions (Paid Tiers Only) */}
      {showPlanSidebar && proposedPlan && entitlement?.tier && ['pro', 'pro_max', 'team', 'enterprise'].includes(entitlement.tier) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(77,167,255,0.05)', border: '1px solid rgba(77,167,255,0.15)', borderRadius: '8px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(77,167,255,0.85)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reviewing: {proposedPlan.name}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.5' }}>{proposedPlan.content}</div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              type="text"
              value={planRevisionFeedback}
              onChange={(e) => setPlanRevisionFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && planRevisionFeedback.trim()) {
                  // Send feedback to PawOS
                  setPlanRevisionFeedback('');
                }
              }}
              placeholder="Describe the changes you want..."
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.85)', fontSize: '13px', outline: 'none', padding: '0' }}
            />
            <button
              onClick={() => {
                if (planRevisionFeedback.trim()) {
                  // Send feedback to PawOS
                  setPlanRevisionFeedback('');
                }
              }}
              style={{ padding: '6px 14px', background: 'rgba(77,167,255,0.2)', border: '1px solid rgba(77,167,255,0.4)', borderRadius: '4px', color: 'rgba(77,167,255,0.9)', cursor: 'pointer', fontSize: '11px', fontWeight: '600', transition: 'all 0.15s ease', flexShrink: 0 }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(77,167,255,0.3)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(77,167,255,0.2)'; }}
              type="button"
            >
              Send
            </button>
            <button
              onClick={() => { setShowPlanSidebar(false); setPlanRevisionFeedback(''); }}
              style={{ padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '11px', fontWeight: '600', transition: 'all 0.15s ease', flexShrink: 0 }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Credits Usage Bar - Shows real-time credits consumption (used | remaining) */}
      {creditsUsage.dollarBought > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: '32px', backgroundColor: 'rgba(76, 175, 80, 0.05)', animation: 'slideIn 0.3s ease-out' }}>
          <span style={{ fontSize: '12px', color: 'rgba(76, 175, 80, 0.9)', fontWeight: 500 }}>
            💳 {creditsUsage.dollarUsedThisSession.toFixed(1)} used | {dollarRemaining.toFixed(1)} remaining
          </span>
        </div>
      )}

      {/* Bottom Bar: Accept Edits + Model Selector (Claude Code style) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', minHeight: '44px', backgroundColor: 'rgba(10,10,12,0.6)' }} ref={prMenuRef}>
        {/* Left: Accept Edits Button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'color 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.95)'}
            onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
            type="button"
          >
            Accept edits
          </button>
          <button
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px 6px',
              transition: 'color 0.15s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
            onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
            title="Add new edit"
            type="button"
          >
            +
          </button>
          <button
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '4px 6px',
              transition: 'color 0.15s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
            onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
            onClick={() => setPrMenuOpen(!prMenuOpen)}
            type="button"
          >
            ▼
          </button>
            {prMenuOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '8px',
                background: 'rgba(12,12,16,0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                minWidth: '200px',
                zIndex: 100,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(12px)',
              }}>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">Manually create a PR</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">Create a draft PR</button>
                <button style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', textAlign: 'left', fontSize: '12px', transition: 'background 0.15s ease' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} type="button">Create PR</button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Model Selector + Usage Circle */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }} ref={modelMenuRef}>
          <button
            type="button"
            onClick={() => setModelMenuOpen((open) => !open)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'color 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.9)'}
            onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
          >
            {activePawModelDescriptor?.label || 'Model'}
          </button>

          {/* Usage Circle Indicator */}
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: `conic-gradient(
                rgba(77, 167, 255, 0.8) 0deg ${(entitlement?.usage5hPc ?? 0) / (entitlement?.limit5hPc ?? 1) * 360}deg,
                rgba(255, 255, 255, 0.1) ${(entitlement?.usage5hPc ?? 0) / (entitlement?.limit5hPc ?? 1) * 360}deg
              )`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title={`Usage: ${entitlement?.usage5hPc ?? 0}/${entitlement?.limit5hPc ?? '∞'} PC (5h)`}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = '0.8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: 'rgba(10, 10, 12, 0.8)'
              }}
            />
          </div>
        </div>
      </div>


      {/* Permissions Modal */}
      {permissionsOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPermissionsOpen(false)}>
          <div style={{ background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '28px', maxWidth: '520px', width: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'rgba(255,255,255,0.95)', marginBottom: '20px' }}>Allow PawOS Permissions</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '12px', lineHeight: '1.6' }}>
              PawOS needs permission to perform actions. Grant access to capabilities you want to enable:
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,165,0,0.7)', marginBottom: '20px', padding: '8px 12px', background: 'rgba(255,165,0,0.1)', borderRadius: '6px', border: '1px solid rgba(255,165,0,0.2)' }}>
              💡 Press Alt+Enter to allow all permissions at once
            </div>

            {/* Permissions List - Organized by Category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              {[
                { category: 'File Access', items: [
                  { key: 'readFiles', label: 'Read Files', desc: 'Read file contents from your project' },
                  { key: 'readCurrentCode', label: 'Read Current Code', desc: 'Access code currently being edited' },
                  { key: 'modifyFiles', label: 'Modify Files', desc: 'Write changes to project files' },
                ]},
                { category: 'Analysis', items: [
                  { key: 'analyzeTicket', label: 'Analyze Tickets', desc: 'Read and analyze ticket/issue content' },
                  { key: 'analyzeRepo', label: 'Analyze Repository', desc: 'Read repository code and structure' },
                  { key: 'analyzeGitHistory', label: 'Analyze Git History', desc: 'Access commit history and changes' },
                ]},
                { category: 'Code Execution', items: [
                  { key: 'editCode', label: 'Edit Code', desc: 'Edit and modify code files' },
                  { key: 'runCode', label: 'Run Code', desc: 'Execute code and tests' },
                  { key: 'executeScripts', label: 'Execute Scripts', desc: 'Run automation scripts' },
                  { key: 'executeShell', label: 'Execute Shell', desc: 'Run shell commands' },
                ]},
                { category: 'Git & Version Control', items: [
                  { key: 'commitChanges', label: 'Commit Changes', desc: 'Create git commits' },
                  { key: 'pushCode', label: 'Push Code', desc: 'Push changes to remote repository' },
                  { key: 'createBranches', label: 'Create Branches', desc: 'Create and switch git branches' },
                  { key: 'createPullRequests', label: 'Create Pull Requests', desc: 'Create pull requests/merge requests' },
                ]},
                { category: 'Meeting & Communication', items: [
                  { key: 'recordMeeting', label: 'Record Meeting', desc: 'Record audio from your meetings' },
                  { key: 'recordSummary', label: 'Generate Meeting Summary', desc: 'Create summaries from recordings' },
                ]},
                { category: 'Data & Context', items: [
                  { key: 'accessText', label: 'Access Text Content', desc: 'Read and process text files' },
                  { key: 'processImages', label: 'Process Images', desc: 'Analyze and process image files' },
                  { key: 'accessWebsites', label: 'Access Websites', desc: 'Fetch content from web URLs' },
                  { key: 'accessAPIs', label: 'Access APIs', desc: 'Call external APIs and services' },
                  { key: 'storeData', label: 'Store Data', desc: 'Save data to local storage' },
                  { key: 'shareContext', label: 'Share Context', desc: 'Share conversation context' },
                ]},
              ].map(({ category, items }) => (
                <div key={category}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{category}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map(({ key, label, desc }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', cursor: 'pointer' }} onClick={() => setPermissions({ ...permissions, [key]: !permissions[key as keyof typeof permissions] })}>
                  <input
                    type="checkbox"
                    checked={permissions[key as keyof typeof permissions]}
                    onChange={() => {}}
                    style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: '#4da7ff' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>{label}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{desc}</div>
                  </div>
                </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Buttons - Like Claude */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ marginRight: '12px' }}>ESC</span>
                <span>Alt+Enter</span>
              </div>
              <button
                onClick={() => setPermissionsOpen(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s ease' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                type="button"
              >
                Deny
              </button>
              <button
                onClick={() => setPermissionsOpen(false)}
                style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s ease' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                type="button"
              >
                Allow Once
              </button>
              <button
                onClick={() => {
                  setPermissions({
                    readFiles: true,
                    readCurrentCode: true,
                    analyzeTicket: true,
                    analyzeRepo: true,
                    analyzeGitHistory: true,
                    recordMeeting: true,
                    recordSummary: true,
                    editCode: true,
                    modifyFiles: true,
                    runCode: true,
                    executeScripts: true,
                    executeShell: true,
                    pushCode: true,
                    commitChanges: true,
                    createBranches: true,
                    createPullRequests: true,
                    accessText: true,
                    processImages: true,
                    accessWebsites: true,
                    accessAPIs: true,
                    storeData: true,
                    shareContext: true,
                  });
                  setPermissionsOpen(false);
                }}
                style={{ padding: '10px 20px', background: 'rgba(77,167,255,0.2)', border: '1px solid rgba(77,167,255,0.4)', borderRadius: '6px', color: 'rgba(77,167,255,0.9)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s ease' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(77,167,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(77,167,255,0.6)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(77,167,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(77,167,255,0.4)'; }}
                type="button"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tier Upgrade Popup - For Go Tier Users */}
      {showTierUpgradePopup && entitlement?.tier === 'go' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowTierUpgradePopup(false)}>
          <div style={{ background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '28px', maxWidth: '520px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'rgba(255,255,255,0.95)', marginBottom: '16px' }}>Current Tier: Go (Free)</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              In current Tier I have access to analyse and plan only. I can't have access to edit or view code.
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowTierUpgradePopup(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s ease' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                type="button"
              >
                Later
              </button>
              <button
                onClick={() => { setShowTierUpgradePopup(false); onUpgrade?.(); }}
                style={{ padding: '10px 20px', background: 'rgba(77,167,255,0.2)', border: '1px solid rgba(77,167,255,0.4)', borderRadius: '6px', color: 'rgba(77,167,255,0.9)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.15s ease' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(77,167,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(77,167,255,0.6)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(77,167,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(77,167,255,0.4)'; }}
                type="button"
              >
                Get Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setFeedbackModalOpen(false)}>
          <div style={{ background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '24px', maxWidth: '480px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginBottom: '16px' }}>Send feedback</div>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Describe the issue"
              style={{ width: '100%', height: '120px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', padding: '12px', fontSize: '13px', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '12px', marginBottom: '16px', lineHeight: '1.4' }}>
              This report will include your description and the current session transcript. We may use these to debug related issues and improve Claude Code.
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setFeedbackModalOpen(false);
                  setFeedbackText('');
                }}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', padding: '8px 16px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '12px', transition: 'all 0.15s ease' }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setFeedbackModalOpen(false);
                  setFeedbackText('');
                }}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', padding: '8px 16px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '12px', fontWeight: '500', transition: 'all 0.15s ease' }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                }}
                type="button"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
