/**
 * Browser Open & Analysis Extensions
 *
 * Separate costs for opening external content and analyzing:
 * - Opening from browser: 0.30 PC (fetch, load, parse)
 * - Analyzing content: 0.10 PC (AI analysis of fetched content)
 * - Regular replies/comments: Normal compute (no special charge)
 */

// ============================================================================
// BROWSER OPEN EXTENSION (0.30 PC)
// ============================================================================

export type BrowserOpenStatus =
  | 'pending' // User dragged URL
  | 'opening' // Fetching from browser
  | 'loading' // Parsing content
  | 'opened' // Successfully loaded
  | 'failed'; // Could not open

export interface BrowserOpenExtension {
  type: 'browser-open';
  id: string;
  openId: string;
  status: BrowserOpenStatus;
  sourceUrl: string;
  sourceTitle: string;
  platform: 'jira' | 'linear' | 'github' | 'slack' | 'email' | 'calendar' | 'other';
  resourceId?: string; // PROJ-123, #42, etc.
  contentPreview?: string; // First 500 chars
  cost: 0.30; // Fixed cost to open
  userBalance: number;
  canOpen: boolean;
  openedAt?: number;
  error?: {
    code: string;
    message: string;
  };
  timestamp: number;
}

// ============================================================================
// CONTENT ANALYSIS EXTENSION (0.10 PC)
// ============================================================================

export type AnalysisStatus =
  | 'pending' // User said "analyze"
  | 'analyzing' // AI analyzing content
  | 'complete' // Done
  | 'failed'; // Error during analysis

export interface AnalysisInsight {
  type: 'summary' | 'action-item' | 'blocker' | 'risk' | 'opportunity' | 'question' | 'decision';
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ContentAnalysisExtension {
  type: 'content-analysis';
  id: string;
  analysisId: string;
  status: AnalysisStatus;
  openId?: string; // Links to the BrowserOpenExtension
  sourceUrl: string;
  sourceTitle: string;
  platform: string;
  progress?: number; // 0-100
  cost: 0.10; // Fixed cost to analyze
  userBalance: number;
  canAnalyze: boolean;
  result?: {
    summary: string;
    insights: AnalysisInsight[];
    keywords: string[];
    actionItems: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
  error?: {
    code: string;
    message: string;
  };
  analyzedAt?: number;
  timestamp: number;
}

// ============================================================================
// TIER LIMITS FOR OPEN & ANALYZE
// ============================================================================

export const BROWSER_OPEN_TIER_LIMITS = {
  go: {
    monthlyIncluded: 0, // Pay per open
    costPerOpen: 0.30,
    maxConcurrent: 1,
  },
  pro: {
    monthlyIncluded: 50, // 50 free opens/month
    costPerOpen: 0.30,
    maxConcurrent: 5,
  },
  pro_max: {
    monthlyIncluded: 200, // 200 free opens/month
    costPerOpen: 0.30,
    maxConcurrent: 20,
  },
  team: {
    monthlyIncluded: 1000, // Team pool
    costPerOpen: 0.30,
    maxConcurrent: 100,
  },
  enterprise: {
    monthlyIncluded: Number.POSITIVE_INFINITY,
    costPerOpen: 0,
    maxConcurrent: 500,
  },
};

export const ANALYSIS_TIER_LIMITS = {
  go: {
    monthlyIncluded: 0, // Pay per analysis
    costPerAnalysis: 0.10,
    maxConcurrent: 1,
  },
  pro: {
    monthlyIncluded: 100, // 100 free analyses/month
    costPerAnalysis: 0.10,
    maxConcurrent: 5,
  },
  pro_max: {
    monthlyIncluded: 500, // 500 free analyses/month
    costPerAnalysis: 0.10,
    maxConcurrent: 20,
  },
  team: {
    monthlyIncluded: 2000, // Team pool
    costPerAnalysis: 0.10,
    maxConcurrent: 100,
  },
  enterprise: {
    monthlyIncluded: Number.POSITIVE_INFINITY,
    costPerAnalysis: 0,
    maxConcurrent: 500,
  },
};
