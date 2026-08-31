/**
 * Content Analysis Extensions
 *
 * Unified analysis framework: drag from browser, paste URLs, analyze Slack/Email/Tickets
 * Single 0.30 PC charge covers full analysis with tier-based limits
 */

// ============================================================================
// ANALYSIS STATES & RESULTS
// ============================================================================

export type AnalysisStatus =
  | 'pending' // Waiting for user confirmation
  | 'checking-limits' // Verifying compute availability
  | 'limit-exceeded' // User lacks sufficient compute
  | 'analyzing' // In progress
  | 'processing-results' // Extracting insights
  | 'complete' // Done
  | 'failed' // Error during analysis
  | 'cancelled'; // User cancelled

export type AnalysisSource =
  | 'jira-ticket'
  | 'linear-ticket'
  | 'github-issue'
  | 'github-pr'
  | 'slack-message'
  | 'slack-thread'
  | 'email'
  | 'calendar-event'
  | 'meeting-recording'
  | 'transcription'
  | 'git-commit'
  | 'git-pr'
  | 'code-review'
  | 'document'
  | 'webpage'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'custom-url'
  | 'pasted-text';

export interface AnalysisMetadata {
  source: AnalysisSource;
  sourceUrl?: string;
  sourcePlatform?: string; // 'jira', 'linear', 'github', 'slack', 'email', etc.
  sourceId?: string; // ticket ID, message ID, email ID, etc.
  contentLength?: number; // bytes
  authorEmail?: string;
  createdAt?: number;
  modifiedAt?: number;
}

export interface AnalysisInsight {
  type: 'summary' | 'action-item' | 'blocker' | 'risk' | 'opportunity' | 'question' | 'decision' | 'dependency';
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  relatedItems?: Array<{
    type: string;
    id: string;
    title: string;
  }>;
}

export interface AnalysisResult {
  analysisId: string;
  status: 'complete' | 'partial' | 'error';
  summary: string; // 1-2 sentence summary
  insights: AnalysisInsight[]; // 3-10 key insights
  keywords: string[]; // Main topics/tags
  sentiment?: 'positive' | 'neutral' | 'negative';
  confidence?: number; // 0-100, how confident in the analysis
  suggestedActions?: Array<{
    action: string;
    rationale: string;
  }>;
  relatedTickets?: Array<{
    system: 'jira' | 'linear' | 'github';
    id: string;
    title: string;
    relevance: number; // 0-100
  }>;
  estimatedEffort?: string; // 'small', 'medium', 'large', 'unknown'
  estimatedCost?: number; // In tokens/effort units
  risks?: string[];
  opportunities?: string[];
  nextSteps?: string[];
}

// ============================================================================
// COMPUTE COST STRUCTURE
// ============================================================================

export interface AnalysisCostCalculation {
  baseCost: number; // 0.30 PC
  contentSizeFactor: number; // Multiplier based on content size
  complexityFactor: number; // Multiplier based on content complexity
  totalCost: number; // Final PC cost
  userBalance: number; // User's current PC balance
  tierAllowance: {
    tier: string; // 'go' | 'pro' | 'pro_max' | 'team' | 'enterprise'
    monthlyIncluded: number; // Free analyses per month
    usedThisMonth: number;
    remainingThisMonth: number;
  };
  canAnalyze: boolean; // true if user has sufficient compute
  reason?: string; // Why analysis cannot proceed
}

// ============================================================================
// ANALYSIS EXTENSION
// ============================================================================

export interface AnalysisExtension {
  type: 'analysis';
  id: string;
  analysisId: string;
  status: AnalysisStatus;
  source: AnalysisSource;
  sourceTitle: string;
  metadata: AnalysisMetadata;
  progress?: number; // 0-100
  costEstimate?: number; // PC estimate
  actualCost?: number; // PC charged (after complete)
  result?: AnalysisResult;
  error?: {
    code: string;
    message: string;
  };
  startedAt: number;
  completedAt?: number;
  timestamp: number;
}

// ============================================================================
// BROWSER CONTENT EXTRACTION
// ============================================================================

export interface BrowserContentExtraction {
  url: string;
  title: string;
  contentType: 'html' | 'json' | 'pdf' | 'text' | 'video' | 'audio' | 'image';
  contentLength: number;
  contentPreview: string; // First 500 chars
  extractedAt: number;
  platform?: string; // 'jira', 'linear', 'github', etc. if detected
  resourceId?: string; // ticket ID, PR ID, etc. if detected
}

// ============================================================================
// ANALYSIS TIER LIMITS
// ============================================================================

export const ANALYSIS_TIER_LIMITS = {
  go: {
    monthlyIncluded: 0, // Pay per analysis
    costPerAnalysis: 0.30,
    maxConcurrent: 1,
    maxContentSize: 5 * 1024 * 1024, // 5 MB
    insightLimit: 5,
  },
  pro: {
    monthlyIncluded: 20, // 20 free analyses/month
    costPerAnalysis: 0.30,
    maxConcurrent: 3,
    maxContentSize: 50 * 1024 * 1024, // 50 MB
    insightLimit: 10,
  },
  pro_max: {
    monthlyIncluded: 100, // 100 free analyses/month
    costPerAnalysis: 0.20, // Discounted
    maxConcurrent: 10,
    maxContentSize: 500 * 1024 * 1024, // 500 MB
    insightLimit: 20,
  },
  team: {
    monthlyIncluded: 500, // Pool
    costPerAnalysis: 0.15, // Discounted
    maxConcurrent: 50,
    maxContentSize: 1024 * 1024 * 1024, // 1 GB
    insightLimit: 50,
  },
  enterprise: {
    monthlyIncluded: Number.POSITIVE_INFINITY,
    costPerAnalysis: 0,
    maxConcurrent: 500,
    maxContentSize: 10 * 1024 * 1024 * 1024, // 10 GB
    insightLimit: 100,
  },
};

// ============================================================================
// ANALYSIS REQUEST
// ============================================================================

export interface AnalysisRequest {
  analysisId: string;
  source: AnalysisSource;
  sourceUrl?: string;
  sourceId?: string;
  content: string;
  metadata: AnalysisMetadata;
  userTier: string;
  userId: string;
  requestedAt: number;
}

export interface AnalysisResponse {
  analysisId: string;
  status: 'success' | 'error' | 'limit-exceeded';
  cost: number; // PC charged
  result?: AnalysisResult;
  error?: {
    code: string;
    message: string;
    userFacingMessage: string;
  };
  processingTime: number; // milliseconds
}
