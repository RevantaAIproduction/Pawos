/**
 * Analysis Extension Helpers
 *
 * Factory functions and utilities for content analysis
 */

import type {
  AnalysisExtension,
  AnalysisMetadata,
  AnalysisStatus,
  AnalysisSource,
  AnalysisCostCalculation,
  AnalysisResult,
} from './AnalysisExtensionTypes';
import { ANALYSIS_TIER_LIMITS } from './AnalysisExtensionTypes';

/**
 * Create an analysis extension
 */
export function createAnalysisExtension(options: {
  id?: string;
  analysisId: string;
  status: AnalysisStatus;
  source: AnalysisSource;
  sourceTitle: string;
  metadata: AnalysisMetadata;
  progress?: number;
  costEstimate?: number;
}): AnalysisExtension {
  return {
    type: 'analysis',
    id: options.id || `analysis-${options.analysisId}`,
    analysisId: options.analysisId,
    status: options.status,
    source: options.source,
    sourceTitle: options.sourceTitle,
    metadata: options.metadata,
    progress: options.progress,
    costEstimate: options.costEstimate,
    startedAt: Date.now(),
    timestamp: Date.now(),
  };
}

/**
 * Update analysis extension as it progresses
 */
export function updateAnalysisExtension(
  ext: AnalysisExtension,
  updates: Partial<Omit<AnalysisExtension, 'type' | 'id' | 'timestamp'>>
): AnalysisExtension {
  return {
    ...ext,
    ...updates,
    timestamp: Date.now(),
  };
}

/**
 * Complete analysis with results
 */
export function completeAnalysis(
  ext: AnalysisExtension,
  result: AnalysisResult,
  actualCost: number
): AnalysisExtension {
  return {
    ...ext,
    status: 'complete',
    result,
    actualCost,
    completedAt: Date.now(),
    timestamp: Date.now(),
  };
}

/**
 * Mark analysis as failed
 */
export function failAnalysis(
  ext: AnalysisExtension,
  errorCode: string,
  errorMessage: string
): AnalysisExtension {
  return {
    ...ext,
    status: 'failed',
    error: {
      code: errorCode,
      message: errorMessage,
    },
    completedAt: Date.now(),
    timestamp: Date.now(),
  };
}

/**
 * Calculate content complexity factor (1.0 = base)
 * Multiplies base cost based on content characteristics
 */
export function calculateComplexityFactor(
  content: string,
  source: AnalysisSource
): number {
  let factor = 1.0;

  // Content length factor
  const contentLength = content.length;
  if (contentLength > 100000) factor *= 1.5; // Large content
  else if (contentLength > 50000) factor *= 1.25;
  else if (contentLength > 10000) factor *= 1.1;

  // Source-specific complexity
  switch (source) {
    case 'meeting-recording':
    case 'transcription':
    case 'video':
    case 'audio':
      factor *= 2.0; // Media analysis is more complex
      break;
    case 'code-review':
    case 'github-pr':
      factor *= 1.5; // Code analysis
      break;
    case 'pdf':
      factor *= 1.3; // Document parsing
      break;
    case 'slack-thread':
      factor *= 1.2; // Multiple messages
      break;
  }

  // Detect technical content (increases complexity)
  if (/code|function|class|interface|api|database|sql|json/i.test(content)) {
    factor *= 1.2;
  }

  return Math.min(factor, 3.0); // Cap at 3x
}

/**
 * Calculate size factor (1.0 = base 5KB)
 */
export function calculateSizeFactor(contentLength: number): number {
  const baseSizeKB = 5;
  const sizeKB = contentLength / 1024;
  return Math.max(1.0, sizeKB / baseSizeKB);
}

/**
 * Calculate total cost for analysis
 */
export function calculateAnalysisCost(
  contentLength: number,
  source: AnalysisSource,
  baseCost: number = 0.30
): {
  baseCost: number;
  complexityFactor: number;
  sizeFactor: number;
  totalCost: number;
} {
  const content = ''; // For complexity calculation, pass actual content
  const complexityFactor = calculateComplexityFactor(content, source);
  const sizeFactor = calculateSizeFactor(contentLength);
  const totalCost = baseCost * complexityFactor * sizeFactor;

  return {
    baseCost,
    complexityFactor,
    sizeFactor,
    totalCost: Math.round(totalCost * 100) / 100, // Round to 2 decimals
  };
}

/**
 * Check if user can afford analysis
 */
export function checkAnalysisLimits(
  tier: string,
  currentBalance: number,
  costEstimate: number,
  usedThisMonth: number
): {
  canAnalyze: boolean;
  reason?: string;
  tierLimits: {
    monthlyIncluded: number;
    costPerAnalysis: number;
    remainingThisMonth: number;
  };
} {
  const tierLimits = (ANALYSIS_TIER_LIMITS as Record<string, any>)[tier] || ANALYSIS_TIER_LIMITS.go;

  const remainingThisMonth = tierLimits.monthlyIncluded - usedThisMonth;
  const isFree = remainingThisMonth > 0;
  const actualCost = isFree ? 0 : (costEstimate || 0.30);

  if (actualCost > currentBalance) {
    return {
      canAnalyze: false,
      reason: `Insufficient compute. Need ${actualCost} PC, have ${currentBalance} PC.`,
      tierLimits: {
        monthlyIncluded: tierLimits.monthlyIncluded,
        costPerAnalysis: tierLimits.costPerAnalysis,
        remainingThisMonth,
      },
    };
  }

  return {
    canAnalyze: true,
    tierLimits: {
      monthlyIncluded: tierLimits.monthlyIncluded,
      costPerAnalysis: tierLimits.costPerAnalysis,
      remainingThisMonth: Math.max(0, remainingThisMonth),
    },
  };
}

/**
 * Get analysis source from URL
 */
export function detectSourceFromUrl(url: string): AnalysisSource | null {
  if (url.includes('jira.')) return 'jira-ticket';
  if (url.includes('linear.app')) return 'linear-ticket';
  if (url.includes('github.com')) {
    if (url.includes('/pull/')) return 'github-pr';
    if (url.includes('/issues/')) return 'github-issue';
    return 'github-pr'; // Default to PR
  }
  if (url.includes('slack.com')) {
    if (url.includes('archives')) return 'slack-thread';
    return 'slack-message';
  }
  if (url.includes('gmail') || url.includes('outlook')) return 'email';
  if (url.includes('calendar')) return 'calendar-event';
  if (url.includes('zoom') || url.includes('meet')) return 'meeting-recording';

  return 'webpage';
}

/**
 * Extract basic metadata from URL
 */
export function extractMetadataFromUrl(url: string): Partial<AnalysisMetadata> {
  const source = detectSourceFromUrl(url);

  // Extract ID from common patterns
  let sourceId: string | undefined;
  const match = url.match(/(?:issue|pull)\/(\d+)|id[=/](\w+)|[/?#](\w{2,}-\d+)/);
  if (match) {
    sourceId = match[1] || match[2] || match[3];
  }

  return {
    sourceUrl: url,
    source: source as any,
    sourceId,
    createdAt: Date.now(),
  };
}

/**
 * Format analysis cost for display
 */
export function formatAnalysisCost(pc: number): string {
  if (pc === 0) return 'FREE';
  if (pc < 0.01) return `${(pc * 1000).toFixed(0)}m`;
  return `${pc.toFixed(2)} PC`;
}

/**
 * Estimate remaining analysis budget for tier this month
 */
export function estimateAnalysisBudget(
  tier: string,
  usedThisMonth: number,
  currentBalance: number
): {
  analysesRemaining: number;
  costPerAnalysis: number;
  totalBudgetRemaining: number;
} {
  const tierLimits = (ANALYSIS_TIER_LIMITS as Record<string, any>)[tier] || ANALYSIS_TIER_LIMITS.go;

  const analysesRemaining = Math.max(
    0,
    tierLimits.monthlyIncluded - usedThisMonth
  );
  const costPerAnalysis = tierLimits.costPerAnalysis;
  const totalBudgetRemaining =
    analysesRemaining > 0
      ? Number.POSITIVE_INFINITY
      : Math.floor(currentBalance / costPerAnalysis);

  return {
    analysesRemaining,
    costPerAnalysis,
    totalBudgetRemaining,
  };
}
