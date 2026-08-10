import type { CorrelationRule, ReportBuilder } from '../../EvidenceCorrelationReportEngine';
import type { Finding } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { UxReportFields } from '../../../../shared/intelligence/UxReportTypes';
import type { UxEvidence } from './uxEvidence';

/**
 * UX Intelligence's deterministic rubric — same discipline as websiteCorrelate.ts's
 * WEBSITE_CORRELATION_RULES: every rule reasons only over evidence gatherUxEvidence() already
 * collected (a real, bounded crawl reused from Website Intelligence), never re-fetches, never
 * invents a finding it hasn't observed.
 */
export const UX_CORRELATION_RULES: CorrelationRule<UxEvidence>[] = [
  {
    id: 'missingH1Pages',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => p.headingCounts.h1 === 0).length;
      if (count === 0) return [];
      return [
        {
          category: 'gap',
          severity: 'moderate',
          confidence: 'high',
          statement: `${count} of ${evidence.pages.length} reviewed page${evidence.pages.length === 1 ? '' : 's'} have no <h1> heading — this weakens both page structure and screen-reader navigation.`,
          evidenceRefs: ['pages[].headingCounts.h1'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'multipleH1Pages',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => p.headingCounts.h1 > 1).length;
      if (count === 0) return [];
      return [
        {
          category: 'gap',
          severity: 'minor',
          confidence: 'medium',
          statement: `${count} reviewed page${count === 1 ? '' : 's'} have more than one <h1> heading, which dilutes the page's primary heading for assistive technology.`,
          evidenceRefs: ['pages[].headingCounts.h1'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'imagesMissingAlt',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const totalImages = evidence.pages.reduce((sum, p) => sum + p.imageCount, 0);
      const withAlt = evidence.pages.reduce((sum, p) => sum + p.imagesWithAltCount, 0);
      const missing = totalImages - withAlt;
      if (missing <= 0) return [];
      return [
        {
          category: 'risk',
          severity: missing / Math.max(totalImages, 1) > 0.5 ? 'major' : 'moderate',
          confidence: 'high',
          statement: `${missing} of ${totalImages} <img> element${totalImages === 1 ? '' : 's'} across reviewed pages have no (or empty) alt text — screen-reader users get no description for these images.`,
          evidenceRefs: ['pages[].imageCount', 'pages[].imagesWithAltCount'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'unlabeledFormFields',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const totalFields = evidence.pages.reduce((sum, p) => sum + p.formFieldCount, 0);
      const labeled = evidence.pages.reduce((sum, p) => sum + p.labeledFormFieldCount, 0);
      const unlabeled = totalFields - labeled;
      if (unlabeled <= 0) return [];
      return [
        {
          category: 'risk',
          severity: 'major',
          confidence: 'high',
          statement: `${unlabeled} of ${totalFields} form field${totalFields === 1 ? '' : 's'} across reviewed pages have no associated <label>, aria-label, or aria-labelledby — these fields are effectively unidentified for screen-reader users.`,
          evidenceRefs: ['pages[].formFieldCount', 'pages[].labeledFormFieldCount'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'emptyInteractiveElements',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const total = evidence.pages.reduce((sum, p) => sum + p.emptyInteractiveElementCount, 0);
      if (total === 0) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'medium',
          statement: `${total} button/link element${total === 1 ? '' : 's'} across reviewed pages have neither visible text nor an aria-label — these controls are effectively silent for screen-reader users.`,
          evidenceRefs: ['pages[].emptyInteractiveElementCount'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingNavLandmark',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => !p.hasNavLandmark).length;
      if (count === 0) return [];
      return [
        {
          category: 'gap',
          severity: 'minor',
          confidence: 'medium',
          statement: `${count} of ${evidence.pages.length} reviewed page${evidence.pages.length === 1 ? '' : 's'} have no <nav> element or role="navigation" landmark, making primary navigation harder for assistive technology to locate.`,
          evidenceRefs: ['pages[].hasNavLandmark'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingLangAttribute',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => !p.hasLangAttribute).length;
      if (count === 0) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'high',
          statement: `${count} of ${evidence.pages.length} reviewed page${evidence.pages.length === 1 ? '' : 's'} have no lang attribute on <html> — screen readers can't reliably choose the correct pronunciation/voice.`,
          evidenceRefs: ['pages[].hasLangAttribute'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'pagesFailedToFetch',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.pagesFailed === 0) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'high',
          statement: `${evidence.pagesFailed} linked page${evidence.pagesFailed === 1 ? '' : 's'} discovered during the review failed to load.`,
          evidenceRefs: ['pagesFailed'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'crawlBoundHit',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.hitCrawlBound) return [];
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement: `This report only covers ${evidence.pages.length} page${evidence.pages.length === 1 ? '' : 's'} — the review stopped at its page/depth/time bound, not because the site had no more linked pages.`,
          evidenceRefs: ['hitCrawlBound'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'visualLayoutGap',
    evaluate(): Omit<Finding, 'id'>[] {
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement:
            'This review analyzed static HTML structure only — real rendered layout, color contrast, tap-target sizing, and responsive behavior would require a live browser screenshot, which this pass does not capture.',
          evidenceRefs: [],
          provenance: 'requiresApiAccess',
        },
      ];
    },
  },
];

function toPageSummary(page: UxEvidence['pages'][number]) {
  return page;
}

/**
 * Assembles UxReportFields purely from already-gathered evidence — same discipline as
 * websiteReportBuilder. `findings` is accepted (per ReportBuilder's shared signature) but this
 * builder doesn't need to branch on it — the domain fields are facts, not scored conclusions.
 */
export const uxReportBuilder: ReportBuilder<UxEvidence, UxReportFields> = {
  build(_subject, evidence, _findings): UxReportFields {
    return {
      startUrl: evidence.startUrl,
      pagesReviewed: evidence.pages.length,
      pagesFailed: evidence.pagesFailed,
      hitCrawlBound: evidence.hitCrawlBound,
      pages: evidence.pages.map(toPageSummary),
    };
  },
};
