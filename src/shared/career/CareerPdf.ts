import type { BuildPdfDocument } from '../billing/BuildPdfTypes';
import type { AtsScoreReport, CareerGuidanceReport, StructuredResume } from './CareerTypes';

/** Structured resume → the generic document shape BuildPdfGenerator renders. */
export function resumeToPdfDocument(resume: StructuredResume): BuildPdfDocument {
  const sections: BuildPdfDocument['sections'] = [];
  if (resume.summary) sections.push({ heading: 'Summary', paragraphs: [resume.summary] });
  for (const section of resume.sections) {
    const paragraphs: string[] = [];
    const bullets: string[] = [];
    for (const item of section.items) {
      const line = [item.title, item.subtitle].filter(Boolean).join(' — ');
      paragraphs.push(item.dates ? `${line} (${item.dates})` : line);
      bullets.push(...item.bullets);
    }
    // One entry per item keeps each role's bullets directly under its heading line.
    if (section.items.length <= 1) {
      sections.push({ heading: section.heading, paragraphs, bullets });
    } else {
      sections.push({ heading: section.heading });
      for (const item of section.items) {
        const line = [item.title, item.subtitle].filter(Boolean).join(' — ');
        sections.push({ paragraphs: [item.dates ? `${line} (${item.dates})` : line], bullets: item.bullets });
      }
    }
  }
  if (resume.skills.length > 0) sections.push({ heading: 'Skills', paragraphs: [resume.skills.join(', ')] });
  return { title: resume.fullName || 'Resume', subtitle: [resume.headline, resume.contactLine].filter(Boolean).join(' · '), sections };
}

export function atsReportToPdfDocument(report: AtsScoreReport, jobTitle: string): BuildPdfDocument {
  return {
    title: 'ATS Analysis Result',
    subtitle: `Match score ${report.overallScore}/100${jobTitle ? ` · ${jobTitle}` : ''}`,
    sections: [
      { heading: 'Verdict', paragraphs: [report.verdict] },
      { heading: 'Matched keywords', paragraphs: [report.matchedKeywords.join(', ') || 'None found'] },
      { heading: 'Missing keywords', paragraphs: [report.missingKeywords.join(', ') || 'None'] },
      { heading: 'Section scores', bullets: report.sectionScores.map((s) => `${s.section}: ${s.score}/100 — ${s.feedback}`) },
      { heading: 'Formatting issues', bullets: report.formattingIssues.length ? report.formattingIssues : ['None detected'] },
      { heading: 'Recommendations', bullets: report.recommendations },
    ],
  };
}

export function guidanceToPdfDocument(report: CareerGuidanceReport): BuildPdfDocument {
  return {
    title: 'Career Plan',
    sections: [
      { heading: 'Target roles', bullets: report.targetRoles.map((r) => `${r.title} (fit ${r.fitScore}/100) — ${r.reason}`) },
      { heading: 'Skill gaps', bullets: report.skillGaps.map((g) => `${g.skill}: ${g.whyItMatters} How to learn: ${g.howToLearn}`) },
      { heading: 'Application plan', bullets: report.applicationPlan },
      { heading: 'Interview preparation', bullets: report.interviewPrep.map((q) => `${q.question} — ${q.approach}`) },
    ],
  };
}

/** Plain job-board search links for a role — real, public search pages; no listing API involved. */
export function jobSearchLinks(keywords: string, location: string): Array<{ label: string; url: string }> {
  const q = encodeURIComponent(keywords.trim());
  const loc = encodeURIComponent(location.trim());
  return [
    { label: 'LinkedIn', url: `https://www.linkedin.com/jobs/search/?keywords=${q}${loc ? `&location=${loc}` : ''}` },
    { label: 'Naukri', url: `https://www.naukri.com/jobs-in-india?k=${q}${loc ? `&l=${loc}` : ''}` },
    { label: 'Indeed', url: `https://in.indeed.com/jobs?q=${q}${loc ? `&l=${loc}` : ''}` },
    { label: 'Internshala', url: `https://internshala.com/internships/keywords-${encodeURIComponent(keywords.trim().toLowerCase().replace(/\s+/g, '-'))}` },
  ];
}
