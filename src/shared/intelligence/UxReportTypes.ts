/**
 * UX Intelligence's domain-specific report fields — the `TDomainFields` the shared
 * IntelligenceReport<T> envelope (IntelligenceReportTypes.ts) wraps. Every field here traces back
 * to something uxEvidence.ts actually parsed out of a real fetched page's HTML (heading tags,
 * image/alt attributes, form/label structure, landmark elements) — never a guess. Deliberately
 * scoped to static HTML structure: real visual layout, color contrast, and rendered tap-target
 * sizing would require a live browser screenshot, which this pass doesn't capture (see the
 * always-firing `visualLayoutGap` finding in uxCorrelate.ts).
 */
export type UxHeadingCounts = {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
};

export type UxPageSummary = {
  url: string;
  headingCounts: UxHeadingCounts;
  imageCount: number;
  imagesWithAltCount: number;
  formFieldCount: number;
  labeledFormFieldCount: number;
  hasNavLandmark: boolean;
  hasLangAttribute: boolean;
  emptyInteractiveElementCount: number;
};

export type UxReportFields = {
  startUrl: string;
  pagesReviewed: number;
  pagesFailed: number;
  hitCrawlBound: boolean;
  pages: UxPageSummary[];
};
