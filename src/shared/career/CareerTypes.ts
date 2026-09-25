/**
 * Career tools (PawOS Build's student features): ATS scoring, resume rewriting, resume generation,
 * and job/career guidance. Each tool is gated by its own FeatureId and runs through the same
 * effective-tier Paw Compute gate as a chat turn — see src/main/career/CareerService.ts.
 */

export type CareerToolId = 'atsScore' | 'rewriteResume' | 'generateResume' | 'careerGuidance';

/** One structured resume — the shape every resume tool returns and the PDF export renders. */
export type StructuredResume = {
  fullName: string;
  headline: string;
  contactLine: string;
  summary: string;
  sections: Array<{
    heading: string;
    items: Array<{
      title: string;
      subtitle: string;
      dates: string;
      bullets: string[];
    }>;
  }>;
  skills: string[];
};

export type AtsScoreInput = { resumeText: string; jobDescription: string };

export type AtsScoreReport = {
  /** 0-100 match between the resume and this job description. */
  overallScore: number;
  verdict: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  sectionScores: Array<{ section: string; score: number; feedback: string }>;
  formattingIssues: string[];
  recommendations: string[];
};

export type RewriteResumeInput = { resumeText: string; targetRole: string; jobDescription: string };

export type GenerateResumeInput = {
  fullName: string;
  contact: string;
  targetRole: string;
  education: string;
  experience: string;
  projects: string;
  skills: string;
  achievements: string;
};

export type ResumeResult = { resume: StructuredResume; notes: string[] };

export type CareerGuidanceInput = { resumeText: string; targetRole: string; location: string; experienceLevel: string };

export type CareerGuidanceReport = {
  targetRoles: Array<{ title: string; fitScore: number; reason: string; searchKeywords: string[] }>;
  skillGaps: Array<{ skill: string; whyItMatters: string; howToLearn: string }>;
  applicationPlan: string[];
  interviewPrep: Array<{ question: string; approach: string }>;
};

export type CareerToolRequest =
  | { tool: 'atsScore'; input: AtsScoreInput }
  | { tool: 'rewriteResume'; input: RewriteResumeInput }
  | { tool: 'generateResume'; input: GenerateResumeInput }
  | { tool: 'careerGuidance'; input: CareerGuidanceInput };

export type CareerToolOutput = {
  atsScore: AtsScoreReport;
  rewriteResume: ResumeResult;
  generateResume: ResumeResult;
  careerGuidance: CareerGuidanceReport;
};

export type CareerToolResult<K extends CareerToolId = CareerToolId> =
  | { ok: true; tool: K; data: CareerToolOutput[K] }
  | { ok: false; reason: string; code: 'not-entitled' | 'usage-limit' | 'invalid-input' | 'ai-error' };

export type CareerImportResult =
  | { ok: true; fileName: string; text: string; truncated: boolean }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; reason: string };

export type CareerPdfExportResult =
  | { ok: true; filePath: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; reason: string };
