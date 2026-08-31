/**
 * Browser Open & Analysis Extension Helpers
 *
 * Separate flows:
 * 1. Open from browser: 0.30 PC (fetch, load, parse)
 * 2. Analyze content: 0.10 PC (AI analysis)
 * 3. Regular replies: normal compute
 */

import type {
  BrowserOpenExtension,
  ContentAnalysisExtension,
  BrowserOpenStatus,
} from './BrowserOpenExtensionTypes';
import { BROWSER_OPEN_TIER_LIMITS, ANALYSIS_TIER_LIMITS } from './BrowserOpenExtensionTypes';

/**
 * Create browser open extension (0.30 PC to fetch)
 */
export function createBrowserOpenExtension(options: {
  id?: string;
  sourceUrl: string;
  sourceTitle: string;
  platform: string;
  resourceId?: string;
  userTier: string;
  userBalance: number;
  usedThisMonth: number;
}): BrowserOpenExtension {
  const tierLimits = (BROWSER_OPEN_TIER_LIMITS as Record<string, any>)[options.userTier];
  const monthlyFree = tierLimits?.monthlyIncluded || 0;
  const remainingThisMonth = Math.max(0, monthlyFree - options.usedThisMonth);
  const isFree = remainingThisMonth > 0;
  const actualCost = isFree ? 0 : 0.30;
  const canOpen = actualCost <= options.userBalance;

  return {
    type: 'browser-open',
    id: options.id || `open-${Date.now()}`,
    openId: `open-${Date.now()}`,
    status: canOpen ? 'pending' : 'failed',
    sourceUrl: options.sourceUrl,
    sourceTitle: options.sourceTitle,
    platform: options.platform as any,
    resourceId: options.resourceId,
    cost: 0.30,
    userBalance: options.userBalance,
    canOpen,
    error: !canOpen
      ? {
          code: 'insufficient-compute',
          message: `Need 0.30 PC to open, have ${options.userBalance} PC`,
        }
      : undefined,
    timestamp: Date.now(),
  };
}

/**
 * Create analysis extension (0.10 PC to analyze)
 */
export function createContentAnalysisExtension(options: {
  id?: string;
  analysisId: string;
  sourceUrl: string;
  sourceTitle: string;
  platform: string;
  openId?: string;
  userTier: string;
  userBalance: number;
  usedThisMonth: number;
}): ContentAnalysisExtension {
  const tierLimits = (ANALYSIS_TIER_LIMITS as Record<string, any>)[options.userTier];
  const monthlyFree = tierLimits?.monthlyIncluded || 0;
  const remainingThisMonth = Math.max(0, monthlyFree - options.usedThisMonth);
  const isFree = remainingThisMonth > 0;
  const actualCost = isFree ? 0 : 0.10;
  const canAnalyze = actualCost <= options.userBalance;

  return {
    type: 'content-analysis',
    id: options.id || `analysis-${Date.now()}`,
    analysisId: options.analysisId,
    status: canAnalyze ? 'pending' : 'failed',
    openId: options.openId,
    sourceUrl: options.sourceUrl,
    sourceTitle: options.sourceTitle,
    platform: options.platform,
    cost: 0.10,
    userBalance: options.userBalance,
    canAnalyze,
    error: !canAnalyze
      ? {
          code: 'insufficient-compute',
          message: `Need 0.10 PC to analyze, have ${options.userBalance} PC`,
        }
      : undefined,
    timestamp: Date.now(),
  };
}

/**
 * Update browser open extension as it progresses
 */
export function updateBrowserOpenExtension(
  ext: BrowserOpenExtension,
  updates: Partial<Omit<BrowserOpenExtension, 'type' | 'id' | 'cost'>>
): BrowserOpenExtension {
  return {
    ...ext,
    ...updates,
    timestamp: Date.now(),
  };
}

/**
 * Complete browser open
 */
export function completeBrowserOpen(
  ext: BrowserOpenExtension,
  contentPreview: string
): BrowserOpenExtension {
  return {
    ...ext,
    status: 'opened',
    contentPreview,
    openedAt: Date.now(),
    timestamp: Date.now(),
  };
}

/**
 * Complete analysis
 */
export function completeAnalysis(
  ext: ContentAnalysisExtension,
  result: {
    summary: string;
    insights: Array<{
      type: string;
      title: string;
      description?: string;
      priority?: string;
    }>;
    keywords: string[];
    actionItems: string[];
    sentiment?: string;
  }
): ContentAnalysisExtension {
  return {
    ...ext,
    status: 'complete',
    result: result as any,
    analyzedAt: Date.now(),
    timestamp: Date.now(),
  };
}

/**
 * Check if user can open from browser
 */
export function checkCanOpen(
  userTier: string,
  userBalance: number,
  usedThisMonth: number
): {
  canOpen: boolean;
  cost: number;
  reason?: string;
  remainingThisMonth: number;
} {
  const tierLimits = (BROWSER_OPEN_TIER_LIMITS as Record<string, any>)[userTier];
  const monthlyFree = tierLimits?.monthlyIncluded || 0;
  const remainingThisMonth = Math.max(0, monthlyFree - usedThisMonth);
  const isFree = remainingThisMonth > 0;
  const cost = isFree ? 0 : 0.30;

  if (cost > userBalance) {
    return {
      canOpen: false,
      cost,
      reason: `Need 0.30 PC to open, have ${userBalance} PC`,
      remainingThisMonth,
    };
  }

  return {
    canOpen: true,
    cost,
    remainingThisMonth,
  };
}

/**
 * Check if user can analyze content
 */
export function checkCanAnalyze(
  userTier: string,
  userBalance: number,
  usedThisMonth: number
): {
  canAnalyze: boolean;
  cost: number;
  reason?: string;
  remainingThisMonth: number;
} {
  const tierLimits = (ANALYSIS_TIER_LIMITS as Record<string, any>)[userTier];
  const monthlyFree = tierLimits?.monthlyIncluded || 0;
  const remainingThisMonth = Math.max(0, monthlyFree - usedThisMonth);
  const isFree = remainingThisMonth > 0;
  const cost = isFree ? 0 : 0.10;

  if (cost > userBalance) {
    return {
      canAnalyze: false,
      cost,
      reason: `Need 0.10 PC to analyze, have ${userBalance} PC`,
      remainingThisMonth,
    };
  }

  return {
    canAnalyze: true,
    cost,
    remainingThisMonth,
  };
}

/**
 * Get budget remaining for month
 */
export function getRemainingBudget(
  userTier: string,
  usedOpensThisMonth: number,
  usedAnalysesThisMonth: number,
  currentBalance: number
): {
  openBudget: {
    monthlyFree: number;
    used: number;
    remaining: number;
  };
  analyzeBudget: {
    monthlyFree: number;
    used: number;
    remaining: number;
  };
  computeBalance: number;
} {
  const openLimits = (BROWSER_OPEN_TIER_LIMITS as Record<string, any>)[userTier];
  const analyzeLimits = (ANALYSIS_TIER_LIMITS as Record<string, any>)[userTier];

  return {
    openBudget: {
      monthlyFree: openLimits?.monthlyIncluded || 0,
      used: usedOpensThisMonth,
      remaining: Math.max(0, (openLimits?.monthlyIncluded || 0) - usedOpensThisMonth),
    },
    analyzeBudget: {
      monthlyFree: analyzeLimits?.monthlyIncluded || 0,
      used: usedAnalysesThisMonth,
      remaining: Math.max(0, (analyzeLimits?.monthlyIncluded || 0) - usedAnalysesThisMonth),
    },
    computeBalance: currentBalance,
  };
}

/**
 * Format cost for display
 */
export function formatCost(pc: number): string {
  if (pc === 0) return 'FREE';
  return `${pc.toFixed(2)} PC`;
}
