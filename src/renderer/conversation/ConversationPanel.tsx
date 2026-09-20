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
import { useCurrentFileContext, buildFileContextPrompt } from '../workspace/useCurrentFileContext';
import { FileContextSelector } from './FileContextSelector';
import { shouldShowExecutionChoice, detectStrategyChange } from './IntentDetection';
import { ExecutionChoiceCard } from './ExecutionChoiceCard';
import { executionStrategyStore, type ExecutionStrategy } from './ExecutionStrategyStore';
import { ProjectContextBar } from './ProjectContextBar';
import { CompanionHamburger } from './CompanionHamburger';
import { PlusMenu } from './PlusMenu';
import { AcceptEditsControl } from './AcceptEditsControl';
import { ModelSelectorWidget } from './ModelSelectorWidget';
import { ContextualGovernancePanel } from './ContextualGovernancePanel';
import { ContextualPlanPanel } from './ContextualPlanPanel';
import { MessageActions } from './MessageActions/MessageActions';

/** Reasoning models are genuinely selectable (they change which model actually answers); the rest
 *  of the catalog are automatic, specialized routers Paw invokes per-need â€” shown for transparency
 *  only, never clickable, mirroring AISettingsPage.tsx's own "Default reasoning model" vs. "All Paw
 *  models" split. */
type ModelUiState = 'available' | 'locked' | 'exhausted' | 'comingSoon';

function getModelUiState(model: PawModelDescriptor, entitlement: EntitlementSnapshot | null | undefined): ModelUiState {
  if (model.status === 'comingSoon') return 'comingSoon';
  if (!entitlement || !entitlement.models.includes(model.id)) return 'locked';
  if (!entitlement.hasCreditsRemaining) return 'exhausted';
  return 'available';
}

/** Below this, a paste is probably just a short phrase someone copied â€” above it, it reads as reference material to skim/summarize rather than a spoken command. */
const PASTE_LENGTH_THRESHOLD = 200;

/** Plain-text-readable formats only â€” full document/spreadsheet parsing (PDF, docx, xlsx) is real future work, not something to fake here. Images are handled separately below (Reference Intelligence), not as text. */
const SUPPORTED_FILE_EXTENSIONS = ['.txt', '.csv', '.json', '.md', '.log'];
/** Reference material for Reference/Image Intelligence (a screenshot, mockup, logo) â€” analyzed via analyze_reference_image, never read as text. */
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
  /** "Retry failed step" in a Task Card's Details panel â€” re-runs one action from its own recorded request. */
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
  /** "Add Funds" on a balance-restricted Autonomous Work failure â€” opens the Ticket Balance wallet (Settings â†’ Billing). */
  onOpenTicketBalance?: () => void;
  onPlanDecision?: (planId: string, decision: 'approved' | 'rejected', message: string) => void;
  /** Set when the last submit was blocked by the entitlement/credit gate (see useConversationController). */
  creditsNoticeTier?: SubscriptionTierId | null;
  /** Only meaningful when tier === 'team' â€” which seat rate determines the exhaustion notice's upgrade target. */
  creditsNoticeSeatTier?: SeatTier;
  /** True only for Enterprise (pooled Paw Compute) â€” see EntitlementSnapshot.pooled. */
  creditsNoticePooled?: boolean;
  /** Whether the Pro Max -> Enterprise "Contact Sales" path is reachable from this screen. */
  enterpriseContactAvailable?: boolean;
  onDismissCreditsNotice?: () => void;
  /** Opens the in-app upgrade flow for the next tier up â€” omit where there's no real navigation target yet. */
  onUpgrade?: () => void;
  /** Opens the Paw Compute top-up flow â€” omit where there's no real navigation target yet. */
  onBuyCompute?: () => void;
  /** Opens the Enterprise info/signup page â€” omit where there's no real navigation target yet. */
  onContactSales?: () => void;
  onContactAdmin?: () => void;
  onRequestMoreCompute?: () => void;
  pawCreditsBalanceUsd?: number;
  onCancel?: () => void;
  onUseCredits?: () => void;
  redeemingCredits?: boolean;
  redeemCreditsError?: string | null;
  /** The composer's mode picker â€” see ExecutionModeTypes.ts. Defaults to Auto (today's behavior) when omitted. */
  executionMode?: ConversationExecutionMode;
  onSetExecutionMode?: (mode: ConversationExecutionMode) => void;
  /** Whether the Settings-only "Bypass permissions" toggle is currently on â€” gates whether that mode is selectable at all. */
  bypassPermissionsEnabled?: boolean;
  /** The composer's model picker â€” see PawModelTypes.ts/AIRouter.ts. Authoritative for what's actually
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

  // Hands-on coding: File context for current working file
  const fileContext = useCurrentFileContext();

  // Execution strategy: User's remembered choice (handsOn | autonomous | undefined)
  const [executionStrategy, setExecutionStrategy] = useState<ExecutionStrategy>(() =>
    executionStrategyStore.getStrategy()
  );

  // Execution choice: Store pending request awaiting user's strategy choice (first-time only)
  const [executionChoicePending, setExecutionChoicePending] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{
    text: string;
    context: SubmittedInputContext;
  } | null>(null);

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
  const [usageDropdownOpen, setUsageDropdownOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<'terminal' | 'browser' | 'files' | 'worktree' | null>(null);
  const [fullscreenPanel, setFullscreenPanel] = useState<'terminal' | 'browser' | 'files' | 'worktree' | null>(null);
  const [projectPath, setProjectPath] = useState<string>('');
  const [gitBranches, setGitBranches] = useState<string[]>([]);
  const [gitCommits, setGitCommits] = useState<string[]>([]);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
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

  // Load project data when panels open
  useEffect(() => {
    if (!openPanel) return;

    const loadData = async () => {
      try {
        // These would call ipc handlers that execute shell commands
        // For now, use placeholder data that shows the structure
        const path = await ipc.getProjectPath?.() || '/c/Users/APPLE/Downloads/PawOS';
        const branches = await ipc.getGitBranches?.() || ['main', 'claude/session-1', 'claude/session-2'];
        const commits = await ipc.getGitCommits?.() || ['5ca0f64: Add panel content', '01ed9c7: Remove Microsoft', '39bd40f: Split layout'];
        const files = await ipc.getProjectFiles?.() || ['src/', 'dist/', 'package.json', '.env', '.git/'];

        setProjectPath(path);
        setGitBranches(branches);
        setGitCommits(commits);
        setProjectFiles(files);
      } catch (err) {
        console.log('Could not load project data:', err);
      }
    };

    loadData();
  }, [openPanel, ipc]);

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
      // Skip on fresh/offline install to avoid repeated "Failed to fetch" errors
      if (!navigator.onLine) return;

      try {
        const supabase = await getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          setUserEmail(session.user.email);
        }
      } catch (err) {
        // Silently ignore network errors during initialization
        if (!(err instanceof Error && err.message.includes('Failed to fetch'))) {
          console.debug('Auth load error:', err);
        }
      }
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
  // message â€” without this, they scroll out of view the moment the
  // transcript overflows its fixed height, so the user never actually
  // sees "Installing Xâ€¦" / "Setting Yâ€¦" happen even though it's right
  // there in the DOM. Every new message â€” including in-place narration
  // updates from streaming to final â€” should keep the latest one in view.
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

  // Hands-on coding: Reload file context after code edits are applied
  useEffect(() => {
    if (!fileContext.currentFile) return;

    // Find the most recent completed task with an applyCodeEdit action
    const recentTask = snapshot.messages
      .filter(m => m.task && m.task.status === 'completed')
      .pop()?.task;

    if (!recentTask) return;

    // Check if this task contains an applyCodeEdit action that just completed
    const hasCodeEditAction = recentTask.actions.some(
      a => a.type === 'applyCodeEdit' && a.endedAt !== null && a.result?.ok === true
    );

    if (hasCodeEditAction) {
      void fileContext.reloadFile();
    }
  }, [snapshot.messages]);

  // While performing an action, show what's actually happening ("Opening VS
  // Codeâ€¦") instead of the generic "Performing action" â€” Desktop Status
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
    // Hands-on coding: Inject file context if a file is selected
    const fileContextPrompt = buildFileContextPrompt(fileContext.currentFile);
    const reasoningText = fileContextPrompt
      ? `${fileContextPrompt}\n\nUser request: ${text}`
      : text;

    const context = wasPasted
      ? { source: 'pasted' as const, reasoningText, projectId: windowCtx.context.project?.id }
      : { reasoningText, projectId: windowCtx.context.project?.id };

    // EXECUTION STRATEGY: Check if this is an explicit strategy change request
    const strategyChange = detectStrategyChange(text);
    if (strategyChange) {
      // User explicitly changed strategy - persist it
      executionStrategyStore.setStrategy(strategyChange);
      setExecutionStrategy(strategyChange);
      // Submit the request normally (confirm the strategy change in conversation)
      onSendTranscript(text, context);
      setDraft('');
      lastSyncedVoiceDraftRef.current = '';
      setWasPasted(false);
      requestAnimationFrame(resizeTextarea);
      return;
    }

    // EXECUTION CHOICE: Determine if we should show the choice card
    // Note: Attachments use a separate onSendTranscript call (line 930), not send().
    // send() only handles pure text, so hasAttachedImages is always false here.
    const hasAttachedImages = false;
    const hasExistingStrategy = executionStrategy !== undefined;
    const isActionable = shouldShowExecutionChoice(
      text,
      windowCtx.context,
      hasAttachedImages,
      !!fileContext.currentFile,
      hasExistingStrategy,
      false // not a strategy change request (already handled above)
    );

    // If user has a strategy AND request is actionable â†’ apply strategy automatically
    if (hasExistingStrategy && isActionable) {
      const temporaryMode = executionStrategy === 'handsOn' ? 'acceptEdits' : 'plan';
      const contextWithMode: SubmittedInputContext = {
        ...context,
        temporaryExecutionMode: temporaryMode,
      };
      onSendTranscript(text, contextWithMode);
      setDraft('');
      lastSyncedVoiceDraftRef.current = '';
      setWasPasted(false);
      requestAnimationFrame(resizeTextarea);
      return;
    }

    // First-time actionable request with no strategy â†’ show choice card
    if (!hasExistingStrategy && isActionable) {
      setPendingRequest({ text, context });
      setExecutionChoicePending(true);
      return;
    }

    // Non-actionable request â†’ normal submission
    onSendTranscript(text, context);
    setDraft('');
    lastSyncedVoiceDraftRef.current = '';
    setWasPasted(false);
    requestAnimationFrame(resizeTextarea);
  };

  const handleExecutionChoice = (choice: 'work_with_me' | 'autonomous') => {
    if (!pendingRequest) return;

    // Persist the strategy for future requests
    const strategy = choice === 'work_with_me' ? 'handsOn' : 'autonomous';
    executionStrategyStore.setStrategy(strategy);
    setExecutionStrategy(strategy);

    // Add temporary execution mode to context based on choice
    const temporaryMode = choice === 'work_with_me' ? 'acceptEdits' : 'plan';
    const contextWithMode: SubmittedInputContext = {
      ...pendingRequest.context,
      temporaryExecutionMode: temporaryMode,
    };

    // Submit the pending request with the chosen execution strategy
    onSendTranscript(pendingRequest.text, contextWithMode);

    // Clear pending choice state
    setExecutionChoicePending(false);
    setPendingRequest(null);
    setDraft('');
    lastSyncedVoiceDraftRef.current = '';
    setWasPasted(false);
    requestAnimationFrame(resizeTextarea);
  };

  const handleCancelExecutionChoice = () => {
    setExecutionChoicePending(false);
    setPendingRequest(null);
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
      onSendTranscript(`ðŸ“Ž ${file.name || 'pasted image'}`, { source: 'image', imageDataUrl });
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
      ? `${content.slice(0, MAX_FILE_CHARS)}\n\n[Truncated â€” the file continues beyond this point.]`
      : content;

    onSendTranscript(`ðŸ“Ž ${file.name}`, { reasoningText, source: 'file' });
  };


  const hasMessages = snapshot.messages.length > 0;
  const isIdleState = !hasMessages && !isStreaming && !proposedPlan;

  return (
    <section className={styles.panel} aria-label="Conversation panel">
      {/* PREMIUM HEADER */}
      <div className={styles.premiumHeader}>
        <div className={styles.headerLeft}>
          <CompanionHamburger userEmail={userEmail} entitlement={entitlement} />
          <div className={styles.pawosLogo}>
            {projectPath ? projectPath.split(/[\\/]/).pop() || 'PawOS' : 'PawOS'}
          </div>
        </div>

        <div className={styles.headerCenter}>
          <ProjectContextBar currentWorkingFile={currentWorkingFile} />
        </div>

        {/* Workspace Controls - Only show during active conversation for paid tiers */}
        {hasMessages && (
          <div className={styles.workspaceControls}>
            <button className={styles.workspaceTab} onClick={() => setOpenPanel(openPanel === 'terminal' ? null : 'terminal')} title="Terminal">
              âŒ˜ Terminal
            </button>
            <button className={styles.workspaceTab} onClick={() => setOpenPanel(openPanel === 'browser' ? null : 'browser')} title="Browser">
              ðŸŒ Browser
            </button>
            <button className={styles.workspaceTab} onClick={() => setOpenPanel(openPanel === 'files' ? null : 'files')} title="Files">
              ðŸ“ Files
            </button>
            <button className={styles.workspaceTab} onClick={() => setOpenPanel(openPanel === 'worktree' ? null : 'worktree')} title="Worktree">
              ðŸŒ³ Worktree
            </button>
          </div>
        )}
        {isIdleState && entitlement?.tier === 'go' && (
          <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.2)', padding: '0 8px' }}>
            Workspace panels available in Pro tier
          </div>
        )}

        <div className={styles.headerRight}>
          <button className={styles.closeBtn} onClick={onClose} type="button" title="Close" aria-label="Close">
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.closeIcon} aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>
      </div>

      {/* â• SPLIT LAYOUT: Conversation (left) + Panel (right) â• */}
      <div className={styles.splitContainer}>
        {/* LEFT SIDE: Conversation & Idle State */}
        <div className={styles.splitLeft}>
          {/* IDLE STATE: Character + Greeting */}
          {isIdleState && (
            <div className={styles.idleState}>
              <div className={styles.idleCharacter}>
                <img
                  src="file:///C:/Users/APPLE/Pictures/Screenshots/Screenshot 2026-09-10 175724.png"
                  alt="PawOS Character"
                  className={styles.characterImage}
                />
              </div>
              <div className={styles.idleGreeting}>
                <h1 className={styles.greetingTitle}>
                  What's up next{userEmail ? `, ${userEmail.split('@')[0]}` : ''}?
                </h1>
                <p className={styles.greetingSubtitle}>Ask me to build, fix, automate, or research anything.</p>
              </div>
            </div>
          )}

          {/* CONVERSATION SCROLL AREA */}
          {hasMessages && (
            <div className={styles.conversationArea} ref={transcriptRef}>
              {/* Credits exhaustion notice */}
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

              {/* File context selector for hands-on coding */}
              {windowCtx.context.project && (
                <FileContextSelector />
              )}

              {/* Execution strategy choice card - first-time users */}
              {executionChoicePending && pendingRequest && (
                <ExecutionChoiceCard
                  understanding={`I understand you want to: ${pendingRequest.text}`}
                  onWorkWithMe={() => handleExecutionChoice('work_with_me')}
                  onAutonomous={() => handleExecutionChoice('autonomous')}
                  onCancel={handleCancelExecutionChoice}
                />
              )}

              {/* Messages container - conversation history */}
              <div className={styles.transcript}>
                {snapshot.messages.map((message, idx) => {
                  const timestamp = message.createdAt ? new Date(message.createdAt) : new Date();
                  const now = new Date();
                  const diffMs = now.getTime() - timestamp.getTime();
                  const diffMins = Math.floor(diffMs / 60000);
                  const timeDisplay = diffMins === 0 ? 'just now' : diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ago`;

                  return (
                    <div key={idx} className={`${styles.message} ${styles[message.role]}`}>
                      <div className={styles.messageContent}>
                        {message.role === 'user' ? (
                          <div>{message.content}</div>
                        ) : (
                          <div>
                            {message.content && <span>{message.content}</span>}
                            {message.extensions && message.extensions.length > 0 && (
                              <ExtensionRenderer
                                extensions={message.extensions}
                                onExpand={handleExtensionExpand}
                                onAction={handleExtensionAction}
                              />
                            )}
                          </div>
                        )}
                      </div>
                                              <MessageActions
                          messageId={message.id}
                          timestamp={new Date(message.createdAt)}
                          onCopy={() => navigator.clipboard.writeText(message.content)}
                          onDownloadPdf={
                            (message.role === 'assistant' && message.content.toLowerCase().includes('ats analysis')) 
                              ? async () => {
                                  try {
                                    // Structured extraction for PDF
                                    const lines = message.content.split('\n');
                                    const docData = {
                                      title: 'ATS Analysis Result',
                                      sections: [{ paragraphs: lines }]
                                    };
                                    // Assume window.ipc exposes the generated functions
                                    const ipcAny = window.ipc as any;
                                    const res = await ipcAny.billingGenerateBuildResumeAtsPdf(docData);
                                    if (res?.ok) {
                                      // Success
                                    } else if (!res?.canceled) {
                                      console.error(res?.reason || 'Failed to generate PDF');
                                    }
                                  } catch (e) {
                                    console.error(e);
                                  }
                                }
                              : (message.role === 'assistant' && message.content.toLowerCase().includes('rewritten resume'))
                              ? async () => {
                                  try {
                                    const lines = message.content.split('\n');
                                    const docData = {
                                      title: 'Rewritten Resume',
                                      sections: [{ paragraphs: lines }]
                                    };
                                    const ipcAny = window.ipc as any;
                                    const res = await ipcAny.billingGenerateBuildResumeRewritePdf(docData);
                                    if (res?.ok) {
                                      // Success
                                    } else if (!res?.canceled) {
                                      console.error(res?.reason || 'Failed to generate PDF');
                                    }
                                  } catch (e) {
                                    console.error(e);
                                  }
                                }
                              : undefined
                          }
                        />
                    </div>
                  );
                })}

                {isStreaming && (
                  <div className={styles.streaming}>
                    âœ¨ PawOS is responding
                  </div>
                )}
              </div>

              {/* Contextual work surfaces - shown when active */}
              {proposedPlan && (
                <ContextualPlanPanel
                  plan={proposedPlan}
                  onApprove={() => onPlanDecision?.(proposedPlan.id, 'approved', '')}
                  onDeny={() => onPlanDecision?.(proposedPlan.id, 'rejected', '')}
                  onRevise={() => {}}
                />
              )}

              {/* Governance approval panel - contextual */}
              <ContextualGovernancePanel
                onApprove={(approvalId) => {
                  // Handled via IPC
                }}
                onDeny={(approvalId) => {
                  // Handled via IPC
                }}
              />
          </div>
          )}
        </div>

        {/* RIGHT SIDE: Workspace Panels */}
        {openPanel && (
          <div className={styles.splitRight}>
            {/* Panel Header */}
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>
                {openPanel === 'terminal' && 'âŒ˜ Terminal'}
                {openPanel === 'browser' && 'ðŸŒ Browser'}
                {openPanel === 'files' && 'ðŸ“ Files'}
                {openPanel === 'worktree' && 'ðŸŒ³ Worktree'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setFullscreenPanel(openPanel)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.5)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: '16px'
                  }}
                  title="Open fullscreen"
                >
                  â›¶
                </button>
                <button
                  onClick={() => setOpenPanel(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.5)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: '16px'
                  }}
                  title="Close panel"
                >
                  âœ•
                </button>
              </div>
            </div>

            {/* Panel Content */}
            <div className={styles.panelContent}>
              {openPanel === 'terminal' && (
                <div style={{ fontSize: '11px' }}>
                  {currentWorkingFile ? (
                    <div style={{
                      padding: '12px 16px',
                      fontFamily: 'monospace',
                      color: 'rgba(255, 255, 255, 0.7)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      fontSize: '10px',
                    }}>
                      {projectPath ? `${projectPath}>` : 'Loading...>'}
                    </div>
                  ) : (
                    <div style={{
                      padding: '12px 16px',
                      color: 'rgba(255, 255, 255, 0.3)',
                      fontSize: '10px',
                    }}>
                      Upload a file or start working on a project to use terminal
                    </div>
                  )}
                </div>
              )}
              {openPanel === 'browser' && (
                <div style={{ fontSize: '11px' }}>
                  {currentWorkingFile ? (
                    <>
                      <div style={{
                        padding: '12px 16px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontWeight: 600,
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      }}>
                        Available Servers
                      </div>
                      <div style={{ padding: '8px 16px' }}>
                        <div style={{
                          color: 'rgba(255, 255, 255, 0.4)',
                          fontSize: '10px',
                        }}>
                          Dev servers for active project will appear here
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      padding: '12px 16px',
                      color: 'rgba(255, 255, 255, 0.3)',
                      fontSize: '10px',
                    }}>
                      Upload a file or start working on a project to see available servers
                    </div>
                  )}
                </div>
              )}
              {openPanel === 'files' && (
                <div style={{ fontSize: '11px' }}>
                  {currentWorkingFile ? (
                    <>
                      <div style={{
                        padding: '12px 16px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontWeight: 600,
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      }}>
                        Project Files
                      </div>
                      <div style={{ padding: '8px 16px' }}>
                        {projectFiles.length > 0 ? (
                          projectFiles.map((file, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '4px 0',
                                color: 'rgba(255, 255, 255, 0.6)',
                                fontSize: '10px',
                                cursor: 'pointer',
                                transition: 'color 0.15s',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
                            >
                              {file.endsWith('/') ? 'ðŸ“' : 'ðŸ“„'} {file}
                            </div>
                          ))
                        ) : (
                          <div style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Loading files...</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      padding: '12px 16px',
                      color: 'rgba(255, 255, 255, 0.3)',
                      fontSize: '10px',
                    }}>
                      Upload a file or start working on a project to see files
                    </div>
                  )}
                </div>
              )}
              {openPanel === 'worktree' && (
                <div style={{ fontSize: '11px' }}>
                  {currentWorkingFile ? (
                    <>
                      <div style={{
                        padding: '12px 16px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontWeight: 600,
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      }}>
                        Git Branches
                      </div>
                      <div style={{ padding: '8px 16px' }}>
                        {gitBranches.length > 0 ? (
                          gitBranches.map((branch, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '4px 0',
                                color: branch.includes('*') ? 'rgba(120, 150, 200, 0.8)' : 'rgba(255, 255, 255, 0.5)',
                                fontSize: '10px',
                                fontFamily: 'monospace',
                              }}
                            >
                              {branch.includes('*') ? 'â— ' : '  '}{branch}
                            </div>
                          ))
                        ) : (
                          <div style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Loading branches...</div>
                        )}
                      </div>
                      <div style={{
                        padding: '12px 16px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontWeight: 600,
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      }}>
                        Recent Commits
                      </div>
                      <div style={{ padding: '8px 16px' }}>
                        {gitCommits.length > 0 ? (
                          gitCommits.map((commit, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '4px 0',
                                color: 'rgba(255, 255, 255, 0.5)',
                                fontSize: '9px',
                                fontFamily: 'monospace',
                              }}
                            >
                              {commit}
                            </div>
                          ))
                        ) : (
                          <div style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Loading commits...</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      padding: '12px 16px',
                      color: 'rgba(255, 255, 255, 0.3)',
                      fontSize: '10px',
                    }}>
                      Upload a file or start working on a project to see worktree
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* â• FULLSCREEN PANEL OVERLAY â• */}
      {fullscreenPanel && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 10, 15, 0.98)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Fullscreen Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(30, 30, 35, 0.5)',
          }}>
            <span style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.7)',
              fontWeight: 600,
            }}>
              {fullscreenPanel === 'terminal' && 'âŒ˜ Terminal'}
              {fullscreenPanel === 'browser' && 'ðŸŒ Browser'}
              {fullscreenPanel === 'files' && 'ðŸ“ Files'}
              {fullscreenPanel === 'worktree' && 'ðŸŒ³ Worktree'}
            </span>
            <button
              onClick={() => setFullscreenPanel(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '20px',
              }}
              title="Close fullscreen"
            >
              âœ•
            </button>
          </div>

          {/* Fullscreen Content */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px 24px',
          }}>
            {fullscreenPanel === 'terminal' && (
              <div style={{ fontSize: '11px' }}>
                {currentWorkingFile ? (
                  <div style={{
                    fontFamily: 'monospace',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '12px',
                  }}>
                    {projectPath ? `${projectPath}>` : 'Loading...>'}
                  </div>
                ) : (
                  <div style={{
                    color: 'rgba(255, 255, 255, 0.3)',
                    fontSize: '12px',
                  }}>
                    Upload a file or start working on a project to use terminal
                  </div>
                )}
              </div>
            )}
            {fullscreenPanel === 'browser' && (
              <div style={{ fontSize: '12px' }}>
                {currentWorkingFile ? (
                  <>
                    <div style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontWeight: 600,
                      marginBottom: '12px',
                    }}>
                      Available Servers
                    </div>
                    <div style={{
                      color: 'rgba(255, 255, 255, 0.4)',
                      fontSize: '12px',
                    }}>
                      Dev servers for active project will appear here
                    </div>
                  </>
                ) : (
                  <div style={{
                    color: 'rgba(255, 255, 255, 0.3)',
                    fontSize: '12px',
                  }}>
                    Upload a file or start working on a project to see available servers
                  </div>
                )}
              </div>
            )}
            {fullscreenPanel === 'files' && (
              <div style={{ fontSize: '12px' }}>
                {currentWorkingFile ? (
                  <>
                    <div style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontWeight: 600,
                      marginBottom: '12px',
                    }}>
                      Project Files
                    </div>
                    <div>
                      {projectFiles.length > 0 ? (
                        projectFiles.map((file, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '4px 0',
                              color: 'rgba(255, 255, 255, 0.6)',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
                          >
                            {file.endsWith('/') ? 'ðŸ“' : 'ðŸ“„'} {file}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Loading files...</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{
                    color: 'rgba(255, 255, 255, 0.3)',
                    fontSize: '12px',
                  }}>
                    Upload a file or start working on a project to see files
                  </div>
                )}
              </div>
            )}
            {fullscreenPanel === 'worktree' && (
              <div style={{ fontSize: '12px' }}>
                {currentWorkingFile ? (
                  <>
                    <div style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontWeight: 600,
                      marginBottom: '12px',
                    }}>
                      Git Branches
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                      {gitBranches.length > 0 ? (
                        gitBranches.map((branch, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '4px 0',
                              color: branch.includes('*') ? 'rgba(120, 150, 200, 0.8)' : 'rgba(255, 255, 255, 0.5)',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                            }}
                          >
                            {branch.includes('*') ? 'â— ' : '  '}{branch}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Loading branches...</div>
                      )}
                    </div>
                    <div style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontWeight: 600,
                      marginBottom: '12px',
                    }}>
                      Recent Commits
                    </div>
                    <div>
                      {gitCommits.length > 0 ? (
                        gitCommits.map((commit, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '4px 0',
                              color: 'rgba(255, 255, 255, 0.5)',
                              fontSize: '10px',
                              fontFamily: 'monospace',
                            }}
                          >
                            {commit}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Loading commits...</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{
                    color: 'rgba(255, 255, 255, 0.3)',
                    fontSize: '12px',
                  }}>
                    Upload a file or start working on a project to see worktree
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* â• UPGRADE MESSAGE BAR â• */}
      {showTierUpgradePopup && entitlement && (
        <div className={styles.upgradeBar}>
          <button
            className={styles.upgradeMessage}
            onClick={() => ipc.openBillingSettings?.()}
            title="Click to open billing settings"
          >
            Limit reached to {Math.round((entitlement.usage5hPc / (entitlement.limit5hPc ?? 1)) * 100)}% â€¢{' '}
            {entitlement.tier === 'pro_max'
              ? 'Buy credits: 5x ($100) or 20x ($250)'
              : entitlement.tier === 'pro'
              ? 'Upgrade to Pro Max or buy credits: 5x ($100) or 20x ($250)'
              : 'Upgrade to Pro or Pro Max (no credits option in Go tier)'}
          </button>
          <button
            className={styles.upgradeClose}
            onClick={() => setShowTierUpgradePopup(false)}
            title="Dismiss"
          >
            âœ•
          </button>
        </div>
      )}

      {/* â• BOTTOM COMPOSER â• */}
      <div className={styles.composer}>
        {/* Input row: textarea + voice + send */}
        <div className={styles.composerInputRow}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            placeholder="Describe a task or ask a question..."
            value={draft}
            onChange={(e) => {
              setDraft(e.currentTarget.value);
              setWasPasted(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim() || wasPasted) {
                  onSendTranscript(draft);
                  setDraft('');
                  setWasPasted(false);
                }
              }
            }}
            onPaste={() => setWasPasted(true)}
            disabled={isStreaming}
          />

          <div className={styles.composerInputControls}>
            <button
              className={styles.voiceToggle}
              onClick={() => {
                if (!voiceState.isRecording) {
                  onStartListening();
                  setVoiceState((prev) => ({ ...prev, isRecording: true }));
                } else {
                  onStopListening();
                  setVoiceState((prev) => ({ ...prev, isRecording: false }));
                }
              }}
              type="button"
              disabled={isStreaming}
              title={voiceState.isRecording ? 'Stop recording' : 'Start voice input'}
            >
              <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={styles.voiceIcon} aria-hidden="true"><path d="M12 1v10"/><circle cx="12" cy="16" r="4"/></svg>
            </button>

            <button
              className={styles.voiceToggle}
              onClick={() => setVoiceState((prev) => ({ ...prev, speakerEnabled: !prev.speakerEnabled }))}
              type="button"
              disabled={isStreaming}
              title={voiceState.speakerEnabled ? 'Disable read-aloud' : 'Enable read-aloud'}
            >
              <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={styles.voiceIcon} aria-hidden="true"><path d="M9 9v6a3 3 0 0 0 6 0V9"/><path d="M5 12h14"/></svg>
            </button>

            <button
              className={styles.sendBtn}
              onClick={() => {
                if (draft.trim() || wasPasted) {
                  onSendTranscript(draft);
                  setDraft('');
                  setWasPasted(false);
                }
              }}
              disabled={(!draft.trim() && !wasPasted) || isStreaming}
              type="button"
              title="Send (Enter)"
            >
              â†’
            </button>
          </div>
        </div>

        {/* Controls row: + | strategy | model | usage */}
        <div className={styles.composerControlsRow}>
          <PlusMenu
            onAddFiles={() => {}}
            onAddPhotos={() => {}}
            onAddFolder={() => {}}
            onAddConnector={() => {}}
            onAddSlashCommand={() => {}}
            tier={entitlement?.tier}
          />

          <AcceptEditsControl
            currentStrategy={executionStrategy}
          />

          <div className={styles.spacer} />

          <ModelSelectorWidget
            activePawModel={activePawModel}
            onSelectModel={onSelectModel}
            entitlement={entitlement}
            streamingElapsedSeconds={streamingElapsedSeconds}
            tier={entitlement?.tier}
          />

          <div className={styles.usageIndicatorDropdown} style={{ position: 'relative' }}>
            {(() => {
              const usage5h = entitlement?.usage5hPc ?? 0;
              const limit5h = entitlement?.limit5hPc ?? Infinity;
              const totalUsage = usage5h + (streamingPawCompute ?? 0);
              const percentage = (totalUsage / limit5h) * 100;
              const isStreaming = (streamingPawCompute ?? 0) > 0;

              let circleColor = 'rgba(120, 150, 200, 0.6)'; // muted blue
              if (percentage >= 90) circleColor = 'rgba(180, 100, 100, 0.6)'; // muted red
              else if (percentage >= 65) circleColor = 'rgba(180, 150, 100, 0.6)'; // muted yellow
              if (isStreaming) circleColor = 'rgba(76, 175, 80, 0.6)'; // green when streaming

              return (
                <>
                  <button
                    className={`${styles.usageCircle} ${isStreaming ? styles.streaming : ''}`}
                    style={{ borderColor: circleColor }}
                    title="Click to see usage details"
                    onClick={() => setUsageDropdownOpen(!usageDropdownOpen)}
                  />
                  {usageDropdownOpen && (
                    <div className={styles.usageDropdownMenu}>
                      <div className={styles.usageHeader}>{entitlement?.tier ?? 'Free'} Tier Usage</div>
                      <div className={styles.usageRow}>
                        <span>5-Hour Limit:</span>
                        <span className={styles.usageValue}>{Math.round(usage5h)}{streamingPawCompute ? `+${streamingPawCompute}` : ''} / {Math.round(limit5h)} PC</span>
                      </div>
                      <div className={styles.usageBar}>
                        <div
                          className={styles.usageBarFill}
                          style={{
                            width: `${Math.min(100, (totalUsage / limit5h) * 100)}%`,
                            backgroundColor: percentage >= 90 ? '#d64545' : percentage >= 65 ? '#d4a537' : '#4cafe3'
                          }}
                        />
                      </div>
                      <div className={styles.usagePercentage}>{Math.round(percentage)}%</div>
                      <div className={styles.usageRow} style={{ marginTop: '12px' }}>
                        <span>Weekly Limit:</span>
                        <span className={styles.usageValue}>{Math.round(entitlement?.usageWeeklyPc ?? 0)} / {entitlement?.limitWeeklyPc ?? 'âˆž'} PC</span>
                      </div>
                      {isStreaming && (
                        <div className={styles.usageRow} style={{ marginTop: '12px', color: 'rgba(76, 175, 80, 0.9)' }}>
                          <span>ðŸŸ¢ Currently using:</span>
                          <span>{streamingPawCompute} PC</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </section>
  );
}

