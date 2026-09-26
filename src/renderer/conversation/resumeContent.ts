import type { ChatResumeData } from './ConversationTypes';

/**
 * present_resume's content: validated from the model's arguments into the same document shape the
 * existing PDF export uses (title + sections of heading/paragraph lines). Nothing here touches disk —
 * the user downloads it from the chat (career:exportPdf, with a Save dialog).
 */

const MAX_SECTIONS = 40;
const MAX_LINES_PER_SECTION = 80;
const MAX_LINE_CHARS = 1000;

export function toChatResume(args: unknown): ChatResumeData | null {
  if (typeof args !== 'object' || args === null) return null;
  const a = args as Record<string, unknown>;
  const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim().slice(0, 150) : 'Resume';
  if (!Array.isArray(a.sections)) return null;

  const sections = a.sections
    .slice(0, MAX_SECTIONS)
    .map((raw) => {
      if (typeof raw !== 'object' || raw === null) return null;
      const s = raw as Record<string, unknown>;
      const heading = typeof s.heading === 'string' && s.heading.trim() ? s.heading.trim().slice(0, 150) : undefined;
      const paragraphs = Array.isArray(s.paragraphs)
        ? s.paragraphs
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
            .slice(0, MAX_LINES_PER_SECTION)
            .map((p) => p.trim().slice(0, MAX_LINE_CHARS))
        : [];
      if (!heading && paragraphs.length === 0) return null;
      return heading ? { heading, paragraphs } : { paragraphs };
    })
    .filter((s): s is ChatResumeData['sections'][number] => s !== null);

  return sections.length > 0 ? { title, sections } : null;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s,;)]+|\b(?:linkedin\.com|github\.com)\/[^\s,;)]+/gi;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;
/** Sections the user names in their own words → the heading the resume must then contain. */
const SECTION_WORDS: [RegExp, RegExp, string][] = [
  [/\beducation\b|\bdegree\b|\bb\.?tech\b|\bbachelor|\bmaster|\buniversity\b|\bcollege\b/i, /educat/i, 'Education'],
  [/\bexperience\b|\bworked\b|\bwork at\b/i, /experience|employment|work history/i, 'Experience'],
  [/\bskills?\b/i, /skill/i, 'Skills'],
  [/\bprojects?\b/i, /project/i, 'Projects'],
  [/\bcertifications?\b|\bcertified\b/i, /certif/i, 'Certifications'],
];

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/**
 * Checks the resume against what the user actually typed: every email / phone / link they gave must
 * appear exactly, and every section they mentioned must exist, with a header naming them. Returns the
 * problems (empty = faithful). Guards against small models "tidying" contact details or dropping parts.
 */
export function findResumeProblems(resume: ChatResumeData, userTexts: string[]): string[] {
  const userText = userTexts.join('\n');
  const resumeText = [resume.title, resumeAsText(resume)].join('\n');
  const resumeLower = resumeText.toLowerCase();
  const resumeDigits = digitsOnly(resumeText);
  const problems: string[] = [];

  for (const email of new Set(userText.match(EMAIL) ?? [])) {
    if (!resumeLower.includes(email.toLowerCase())) problems.push(`the email must be exactly "${email}"`);
  }
  for (const phone of new Set(userText.match(PHONE) ?? [])) {
    const digits = digitsOnly(phone);
    if (digits.length >= 10 && !resumeDigits.includes(digits)) problems.push(`the phone number must be exactly "${phone.trim()}"`);
  }
  for (const link of new Set(userText.match(URL_PATTERN) ?? [])) {
    const clean = link.replace(/[.]+$/, '');
    if (!resumeLower.includes(clean.toLowerCase())) problems.push(`the link "${clean}" is missing`);
  }
  const headings = resume.sections.map((s) => s.heading ?? '');
  for (const [mentioned, heading, name] of SECTION_WORDS) {
    if (mentioned.test(userText) && !headings.some((h) => heading.test(h))) problems.push(`a "${name}" section is missing`);
  }
  const first = resume.sections[0];
  if (!first?.heading || /summary|experience|education|skill|profile|objective/i.test(first.heading)) {
    problems.push("the first section's heading must be the person's full name, with their contact details as its lines");
  }
  return problems;
}

/**
 * The resume laid out for the PDF / Word download: the person's name as the document title, their
 * contact lines as the subtitle, then every other section — so the name isn't printed twice.
 */
export function resumeToExportDocument(resume: ChatResumeData): {
  title: string;
  subtitle?: string;
  sections: { heading?: string; paragraphs: string[] }[];
} {
  const [first, ...rest] = resume.sections;
  const isHeader = Boolean(first?.heading) && !/summary|experience|education|skill|profile|objective/i.test(first?.heading ?? '');
  if (!first || !isHeader) return { title: resume.title, sections: resume.sections };
  const subtitle = first.paragraphs.join(' · ');
  return { title: first.heading as string, ...(subtitle ? { subtitle } : {}), sections: rest };
}

/** Plain-text copy of the resume (the message's copy / history text). */
export function resumeAsText(resume: ChatResumeData): string {
  return resume.sections
    .map((section) => [section.heading, ...section.paragraphs].filter(Boolean).join('\n'))
    .join('\n\n');
}
