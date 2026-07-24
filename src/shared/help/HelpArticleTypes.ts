import type { SectionId } from '../../renderer/ui/Dashboard/sections';

/**
 * The Help Center's documentation categories — matches the exact taxonomy
 * specified for the Help tab's category list.
 */
export type HelpCategoryId =
  | 'gettingStarted'
  | 'companion'
  | 'projects'
  | 'development'
  | 'research'
  | 'communication'
  | 'cloud'
  | 'analytics'
  | 'account'
  | 'subscription'
  | 'billing'
  | 'privacy'
  | 'security'
  | 'desktop'
  | 'mobile';

export type HelpArticleExample = {
  title: string;
  /** Ordered, real workflow steps a user can actually follow today — not prose filler. */
  steps: string[];
};

export type HelpFaqEntry = {
  question: string;
  answer: string;
};

/**
 * One reserved step in a future in-app guided-tutorial spotlight/overlay
 * engine (not built in this phase — see HelpArticlesTab/ArticleDetail).
 * `sectionId` ties a step to a real Dashboard section so the future engine
 * can navigate there; nothing renders from this field yet.
 */
export type GuidedTutorialStep = {
  sectionId: SectionId;
  label: string;
  instruction: string;
};

export type HelpArticle = {
  id: string;
  category: HelpCategoryId;
  title: string;
  summary: string;

  overview: string;
  features: string[];
  howItWorks: string;
  bestPractices: string[];
  examples: HelpArticleExample[];
  troubleshooting: string[];
  requirements: string[];
  permissions: string[];
  /** Omitted where administration concepts don't apply to the article. */
  administration?: string;
  /** Omitted where billing isn't relevant to the article. */
  billing?: string;
  faq: HelpFaqEntry[];

  relatedArticleIds: string[];
  /** Settings tab names relevant to this article, e.g. "Companion", "Privacy". */
  relatedSettings?: string[];
  /** Dashboard sections relevant to this article. */
  relatedApps?: SectionId[];
  /** Article ids for guided tutorials — stays empty until the tutorial engine exists. */
  relatedTutorials?: string[];

  /** Search synonyms: exact UI copy, menu labels, feature/model names, common phrasing. */
  keywords: string[];
  aliases: string[];

  /** Reserved — no video content exists yet. */
  videos?: { title: string; url: string }[];
  /** Reserved extension point for a future DOM-spotlight/overlay tutorial engine. */
  guidedTutorial?: { steps: GuidedTutorialStep[] };

  pawosVersion: string;
  updated: string;
  lastReviewed: string;
  author: string;
  readingTimeMinutes: number;

  /** True for content describing a not-yet-shipped capability (e.g. Mobile). Renders "Coming Soon". */
  roadmap?: boolean;
};
