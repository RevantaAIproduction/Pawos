export type BuildPdfDocument = {
  title: string;
  subtitle?: string;
  sections: Array<{
    heading?: string;
    paragraphs?: string[];
    bullets?: string[];
  }>;
  metadata?: Record<string, string>;
};
