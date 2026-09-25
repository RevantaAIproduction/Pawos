import { entitlementService } from '../billing/EntitlementService';
import { rollingUsageGate } from '../billing/RollingUsageGate';
import { creditStore } from '../billing/CreditStore';
import { normalizedComputeToCustomerPc } from '../../shared/billing/CustomerPcCommercialModel';
import { generateJsonDetailed, type GeminiJsonSchema, type GeminiJsonResult } from '../ai/geminiJson';
import type { FeatureId } from '../../shared/billing/BillingTypes';
import type {
  AtsScoreInput,
  AtsScoreReport,
  CareerGuidanceInput,
  CareerGuidanceReport,
  CareerToolId,
  CareerToolRequest,
  CareerToolResult,
  GenerateResumeInput,
  ResumeResult,
  RewriteResumeInput,
  StructuredResume,
} from '../../shared/career/CareerTypes';

/**
 * PawOS's career tools — the student-facing features of PawOS Build (ATS scoring, resume
 * rewriting, resume generation, job/career guidance). Every call:
 *   1. requires the tool's own FeatureId (only PawOS Build grants these today),
 *   2. passes the same effective-tier capacity gate as a chat turn
 *      (EntitlementService.checkGeneration — Build's 500 PC/5h, 1,500 PC/week, 5 h/5h, 15 h/week),
 *   3. holds an in-flight generation slot for its duration,
 *   4. is billed as an interactive request ('conversationTurn'), so its Paw Compute and real request
 *      duration count toward those same limits.
 * No external job-listing API is used: guidance is generated from the student's own resume, and
 * live listings are reached through ordinary job-board search links built in the UI.
 */

export const CAREER_TOOL_FEATURES: Record<CareerToolId, FeatureId> = {
  atsScore: 'atsScoring',
  rewriteResume: 'resumeRewriting',
  generateResume: 'resumeGeneration',
  careerGuidance: 'jobSearch',
};

const CAREER_MODEL = 'gemini-3.6-flash';
const MAX_RESUME_CHARS = 20_000;
const MAX_JOB_DESCRIPTION_CHARS = 15_000;
const MAX_FIELD_CHARS = 6_000;

type GenerateFn = <T>(params: Parameters<typeof generateJsonDetailed>[0]) => Promise<GeminiJsonResult<T>>;

// ── Output normalization — the model's JSON is never trusted to have the declared shape ─────────
function str(value: unknown, max = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function strList(value: unknown, maxItems = 40): string[] {
  return Array.isArray(value) ? value.map((v) => str(v, 500)).filter(Boolean).slice(0, maxItems) : [];
}
function score(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}
function objList(value: unknown, maxItems = 30): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object').slice(0, maxItems) : [];
}

export function normalizeResume(raw: unknown): StructuredResume {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    fullName: str(r.fullName, 200),
    headline: str(r.headline, 300),
    contactLine: str(r.contactLine, 400),
    summary: str(r.summary, 2_000),
    sections: objList(r.sections, 12).map((section) => ({
      heading: str(section.heading, 120),
      items: objList(section.items, 20).map((item) => ({
        title: str(item.title, 200),
        subtitle: str(item.subtitle, 200),
        dates: str(item.dates, 100),
        bullets: strList(item.bullets, 12),
      })),
    })),
    skills: strList(r.skills, 60),
  };
}

export function normalizeAtsReport(raw: unknown): AtsScoreReport {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    overallScore: score(r.overallScore),
    verdict: str(r.verdict, 600),
    matchedKeywords: strList(r.matchedKeywords, 60),
    missingKeywords: strList(r.missingKeywords, 60),
    sectionScores: objList(r.sectionScores, 12).map((s) => ({ section: str(s.section, 120), score: score(s.score), feedback: str(s.feedback, 800) })),
    formattingIssues: strList(r.formattingIssues, 20),
    recommendations: strList(r.recommendations, 20),
  };
}

export function normalizeResumeResult(raw: unknown): ResumeResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { resume: normalizeResume(r.resume), notes: strList(r.notes, 20) };
}

export function normalizeGuidance(raw: unknown): CareerGuidanceReport {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    targetRoles: objList(r.targetRoles, 8).map((role) => ({
      title: str(role.title, 150),
      fitScore: score(role.fitScore),
      reason: str(role.reason, 600),
      searchKeywords: strList(role.searchKeywords, 8),
    })),
    skillGaps: objList(r.skillGaps, 10).map((gap) => ({ skill: str(gap.skill, 120), whyItMatters: str(gap.whyItMatters, 500), howToLearn: str(gap.howToLearn, 600) })),
    applicationPlan: strList(r.applicationPlan, 12),
    interviewPrep: objList(r.interviewPrep, 10).map((q) => ({ question: str(q.question, 400), approach: str(q.approach, 800) })),
  };
}

// ── Schemas ─────────────────────────────────────────────────────────────────────────────────────
const RESUME_SCHEMA: GeminiJsonSchema = {
  type: 'object',
  properties: {
    fullName: { type: 'string' },
    headline: { type: 'string' },
    contactLine: { type: 'string' },
    summary: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                subtitle: { type: 'string' },
                dates: { type: 'string' },
                bullets: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'bullets'],
            },
          },
        },
        required: ['heading', 'items'],
      },
    },
    skills: { type: 'array', items: { type: 'string' } },
  },
  required: ['fullName', 'summary', 'sections', 'skills'],
};

const RESUME_RESULT_SCHEMA: GeminiJsonSchema = {
  type: 'object',
  properties: { resume: RESUME_SCHEMA, notes: { type: 'array', items: { type: 'string' } } },
  required: ['resume', 'notes'],
};

const ATS_SCHEMA: GeminiJsonSchema = {
  type: 'object',
  properties: {
    overallScore: { type: 'number' },
    verdict: { type: 'string' },
    matchedKeywords: { type: 'array', items: { type: 'string' } },
    missingKeywords: { type: 'array', items: { type: 'string' } },
    sectionScores: {
      type: 'array',
      items: {
        type: 'object',
        properties: { section: { type: 'string' }, score: { type: 'number' }, feedback: { type: 'string' } },
        required: ['section', 'score', 'feedback'],
      },
    },
    formattingIssues: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
  required: ['overallScore', 'verdict', 'matchedKeywords', 'missingKeywords', 'sectionScores', 'formattingIssues', 'recommendations'],
};

const GUIDANCE_SCHEMA: GeminiJsonSchema = {
  type: 'object',
  properties: {
    targetRoles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          fitScore: { type: 'number' },
          reason: { type: 'string' },
          searchKeywords: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'fitScore', 'reason', 'searchKeywords'],
      },
    },
    skillGaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { skill: { type: 'string' }, whyItMatters: { type: 'string' }, howToLearn: { type: 'string' } },
        required: ['skill', 'whyItMatters', 'howToLearn'],
      },
    },
    applicationPlan: { type: 'array', items: { type: 'string' } },
    interviewPrep: {
      type: 'array',
      items: { type: 'object', properties: { question: { type: 'string' }, approach: { type: 'string' } }, required: ['question', 'approach'] },
    },
  },
  required: ['targetRoles', 'skillGaps', 'applicationPlan', 'interviewPrep'],
};

// ── Prompts ─────────────────────────────────────────────────────────────────────────────────────
const HONESTY_RULE =
  'Never invent employers, degrees, dates, metrics, certifications or skills that are not supported by the provided text. ' +
  'When a claim would need a number the text does not give, phrase it without a number rather than fabricating one.';

function atsPrompt(input: AtsScoreInput): string {
  return [
    'You are an applicant tracking system (ATS) and an experienced technical recruiter.',
    'Score how well the RESUME matches the JOB DESCRIPTION the way an ATS keyword/section parser and a recruiter screen would.',
    'overallScore is 0-100. matchedKeywords are skills/terms from the job description that the resume clearly shows; missingKeywords are important job-description terms the resume lacks.',
    'sectionScores cover the resume sections that exist (e.g. Summary, Experience, Projects, Education, Skills), each 0-100 with one concrete sentence of feedback.',
    'formattingIssues lists ATS-parsing risks visible in the text (tables, missing section headings, unusual date formats, missing contact details). recommendations are specific, prioritized edits.',
    HONESTY_RULE,
    '',
    'JOB DESCRIPTION:',
    input.jobDescription,
    '',
    'RESUME:',
    input.resumeText,
  ].join('\n');
}

function rewritePrompt(input: RewriteResumeInput): string {
  return [
    'Rewrite the RESUME into a clean, ATS-friendly resume for the target role.',
    'Use standard section headings (Summary, Experience, Projects, Education, Skills — omit any the resume has no content for), reverse-chronological order, and concise bullet points that start with strong action verbs.',
    'Mirror relevant keywords from the job description where the resume genuinely supports them.',
    HONESTY_RULE,
    'notes lists the most important changes you made and anything the student should add themselves (e.g. a missing metric).',
    '',
    `TARGET ROLE: ${input.targetRole || '(not specified — keep the resume general)'}`,
    input.jobDescription ? `JOB DESCRIPTION:\n${input.jobDescription}` : 'JOB DESCRIPTION: (not provided)',
    '',
    'RESUME:',
    input.resumeText,
  ].join('\n');
}

function generatePrompt(input: GenerateResumeInput): string {
  return [
    'Write a complete, ATS-friendly one-page resume for a student or early-career candidate using ONLY the details below.',
    'Use standard section headings (Summary, Education, Experience, Projects, Skills, Achievements — omit empty ones), reverse-chronological order, and concise action-verb bullets.',
    HONESTY_RULE,
    'notes lists gaps the student should fill in (e.g. dates, links, measurable results) before sending the resume.',
    '',
    `NAME: ${input.fullName}`,
    `CONTACT: ${input.contact}`,
    `TARGET ROLE: ${input.targetRole}`,
    `EDUCATION:\n${input.education}`,
    `EXPERIENCE / INTERNSHIPS:\n${input.experience || '(none)'}`,
    `PROJECTS:\n${input.projects || '(none)'}`,
    `SKILLS:\n${input.skills || '(none)'}`,
    `ACHIEVEMENTS / ACTIVITIES:\n${input.achievements || '(none)'}`,
  ].join('\n');
}

function guidancePrompt(input: CareerGuidanceInput): string {
  return [
    'You are a career coach for students and early-career candidates.',
    'From the RESUME, suggest up to 5 realistic target roles (fitScore 0-100, a one-sentence reason, and 2-5 job-board search keywords each),',
    'the most important skill gaps for those roles with a concrete, free or low-cost way to learn each,',
    'a step-by-step application plan for the next few weeks, and 5 likely interview questions with how to approach each using the candidate\'s real experience.',
    HONESTY_RULE,
    '',
    `PREFERRED ROLE: ${input.targetRole || '(open)'}`,
    `PREFERRED LOCATION: ${input.location || '(open)'}`,
    `EXPERIENCE LEVEL: ${input.experienceLevel || 'student / fresher'}`,
    '',
    'RESUME:',
    input.resumeText,
  ].join('\n');
}

// ── Validation ──────────────────────────────────────────────────────────────────────────────────
function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validate(request: CareerToolRequest): { ok: true; prompt: string; schema: GeminiJsonSchema } | { ok: false; reason: string } {
  switch (request.tool) {
    case 'atsScore': {
      const input: AtsScoreInput = { resumeText: clip(request.input?.resumeText, MAX_RESUME_CHARS), jobDescription: clip(request.input?.jobDescription, MAX_JOB_DESCRIPTION_CHARS) };
      if (input.resumeText.length < 200) return { ok: false, reason: 'Add your resume text (at least a few lines) to score it.' };
      if (input.jobDescription.length < 100) return { ok: false, reason: 'Paste the job description you want to score against.' };
      return { ok: true, prompt: atsPrompt(input), schema: ATS_SCHEMA };
    }
    case 'rewriteResume': {
      const input: RewriteResumeInput = {
        resumeText: clip(request.input?.resumeText, MAX_RESUME_CHARS),
        targetRole: clip(request.input?.targetRole, 200),
        jobDescription: clip(request.input?.jobDescription, MAX_JOB_DESCRIPTION_CHARS),
      };
      if (input.resumeText.length < 200) return { ok: false, reason: 'Add your current resume text to rewrite it.' };
      return { ok: true, prompt: rewritePrompt(input), schema: RESUME_RESULT_SCHEMA };
    }
    case 'generateResume': {
      const raw = request.input ?? ({} as GenerateResumeInput);
      const input: GenerateResumeInput = {
        fullName: clip(raw.fullName, 200),
        contact: clip(raw.contact, 400),
        targetRole: clip(raw.targetRole, 200),
        education: clip(raw.education, MAX_FIELD_CHARS),
        experience: clip(raw.experience, MAX_FIELD_CHARS),
        projects: clip(raw.projects, MAX_FIELD_CHARS),
        skills: clip(raw.skills, MAX_FIELD_CHARS),
        achievements: clip(raw.achievements, MAX_FIELD_CHARS),
      };
      if (!input.fullName || !input.targetRole || !input.education) return { ok: false, reason: 'Name, target role and education are required to generate a resume.' };
      if (!input.experience && !input.projects) return { ok: false, reason: 'Add at least one experience, internship or project.' };
      return { ok: true, prompt: generatePrompt(input), schema: RESUME_RESULT_SCHEMA };
    }
    case 'careerGuidance': {
      const input: CareerGuidanceInput = {
        resumeText: clip(request.input?.resumeText, MAX_RESUME_CHARS),
        targetRole: clip(request.input?.targetRole, 200),
        location: clip(request.input?.location, 200),
        experienceLevel: clip(request.input?.experienceLevel, 100),
      };
      if (input.resumeText.length < 200) return { ok: false, reason: 'Add your resume text so guidance is based on your real experience.' };
      return { ok: true, prompt: guidancePrompt(input), schema: GUIDANCE_SCHEMA };
    }
    default:
      return { ok: false, reason: 'Unknown career tool.' };
  }
}

function normalizeOutput(tool: CareerToolId, raw: unknown): unknown {
  switch (tool) {
    case 'atsScore':
      return normalizeAtsReport(raw);
    case 'rewriteResume':
    case 'generateResume':
      return normalizeResumeResult(raw);
    case 'careerGuidance':
      return normalizeGuidance(raw);
  }
}

export async function runCareerTool(request: CareerToolRequest, generate: GenerateFn = generateJsonDetailed): Promise<CareerToolResult> {
  const feature = request && CAREER_TOOL_FEATURES[request.tool];
  if (!feature) return { ok: false, code: 'invalid-input', reason: 'Unknown career tool.' };
  if (!entitlementService.isFeatureAvailable(feature)) {
    return { ok: false, code: 'not-entitled', reason: "Career tools aren't included in your current plan." };
  }

  const validated = validate(request);
  if (!validated.ok) return { ok: false, code: 'invalid-input', reason: validated.reason };

  const admission = entitlementService.checkGeneration();
  if (!admission.allowed) {
    const reason = admission.reason === 'inflight' ? 'Another AI request is still running — try again in a moment.' : admission.reason;
    return { ok: false, code: 'usage-limit', reason };
  }

  const holdsSlot = !admission.pooled;
  if (holdsSlot) rollingUsageGate.reserveSlot();
  let result: GeminiJsonResult<unknown>;
  try {
    result = await generate<unknown>({ prompt: validated.prompt, schema: validated.schema, model: CAREER_MODEL, requestType: 'conversationTurn' });
  } finally {
    if (holdsSlot) rollingUsageGate.releaseSlot();
  }

  // Mirror billing:recordTurnUsage's history write so Analytics shows career usage alongside chat.
  if (result.usageRecord) {
    const customerPc = normalizedComputeToCustomerPc(result.usageRecord.normalizedCompute);
    if (customerPc > 0) creditStore.consume(customerPc, `career:${request.tool}`, 'chat', false, false, result.usageRecord.usageEventId);
  }

  if (!result.ok) return { ok: false, code: 'ai-error', reason: result.reason };
  return { ok: true, tool: request.tool, data: normalizeOutput(request.tool, result.data) } as CareerToolResult;
}
