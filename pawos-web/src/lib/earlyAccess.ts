/**
 * PawOS Early Access — the one shared definition of what a registration is, used by the public
 * form (src/components/early-access/EarlyAccessSection.tsx), the public API route
 * (src/app/api/early-access/route.ts) and the admin list (src/app/admin/early-access/page.tsx).
 * Validation lives here so the browser and the server apply exactly the same rules; the server
 * never trusts the browser's copy of the result, it re-runs validateEarlyAccessInput itself.
 *
 * This is interest collection only — a registration grants nothing (no account, no download,
 * no desktop access). Stored in Supabase's early_access_registrations table, see
 * supabase/migrations/20261003000000_early_access_registrations.sql.
 */

export const EARLY_ACCESS_SOURCE = "pawos-website-early-access";
export const EARLY_ACCESS_INITIAL_STATUS = "registered";

export const EARLY_ACCESS_WORKFLOWS = [
  {
    id: "fix-bug",
    title: "Fix a Bug",
    description: "Investigate the issue, trace the code, implement the fix, and test the result.",
  },
  {
    id: "build-feature",
    title: "Build a Feature",
    description: "Understand the requirement, plan the work, implement the change, and verify it.",
  },
  {
    id: "resolve-ticket",
    title: "Resolve a Ticket",
    description: "Work through Jira or Linear tasks and execute the required engineering work.",
  },
  {
    id: "investigate-codebase",
    title: "Investigate a Codebase",
    description: "Explore repositories, dependencies, architecture, and relevant files.",
  },
  {
    id: "debug-test-failures",
    title: "Debug Test Failures",
    description: "Analyze failures, identify the cause, and work through the required corrections.",
  },
  {
    id: "refactor-code",
    title: "Refactor Code",
    description: "Understand existing code and perform structured code changes.",
  },
  {
    id: "prepare-git-change",
    title: "Prepare a Git Change",
    description: "Make the required changes, verify them, and prepare the Git workflow.",
  },
  {
    id: "browser-research",
    title: "Browser-Based Research",
    description: "Research documentation or web information needed to complete an engineering task.",
  },
] as const;

export type EarlyAccessWorkflowId = (typeof EARLY_ACCESS_WORKFLOWS)[number]["id"];

export const EARLY_ACCESS_ROLES = [
  "Developer",
  "Software Engineer",
  "Engineering Manager",
  "Founder",
  "CTO / Technical Lead",
  "Student",
  "Other",
] as const;

export type EarlyAccessRole = (typeof EARLY_ACCESS_ROLES)[number];

const WORKFLOW_IDS: readonly string[] = EARLY_ACCESS_WORKFLOWS.map((w) => w.id);
const WORKFLOW_TITLES = new Map<string, string>(EARLY_ACCESS_WORKFLOWS.map((w) => [w.id, w.title]));

/** Display title for a stored workflow id — falls back to the raw id for one this build no longer lists. */
export function earlyAccessWorkflowTitle(id: string): string {
  return WORKFLOW_TITLES.get(id) ?? id;
}

/** A validated registration, ready to store. company and githubProfile are optional — null, never an empty string. */
export interface EarlyAccessRegistration {
  name: string;
  email: string;
  role: EarlyAccessRole;
  company: string | null;
  githubProfile: string | null;
  selectedWorkflows: EarlyAccessWorkflowId[];
  customUseCase: string;
}

export type EarlyAccessField = keyof EarlyAccessRegistration;
export type EarlyAccessFieldErrors = Partial<Record<EarlyAccessField, string>>;

export type EarlyAccessValidation =
  | { ok: true; value: EarlyAccessRegistration }
  | { ok: false; errors: EarlyAccessFieldErrors };

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_COMPANY = 160;
const MAX_USE_CASE = 2000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// GitHub's own username rule: 1–39 alphanumerics or single hyphens, never leading/trailing.
const GITHUB_USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Accepts "octocat", "@octocat", "github.com/octocat" or a full profile URL and returns the
 * canonical https://github.com/<username> — or null when it isn't a GitHub profile at all.
 */
export function normalizeGitHubProfile(raw: string): string | null {
  const username = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^github\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  return GITHUB_USERNAME_PATTERN.test(username) ? `https://github.com/${username}` : null;
}

export function validateEarlyAccessInput(input: unknown): EarlyAccessValidation {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: EarlyAccessFieldErrors = {};

  const name = text(body.name);
  if (!name) errors.name = "Enter your full name.";
  else if (name.length > MAX_NAME) errors.name = `Keep your name under ${MAX_NAME} characters.`;

  const email = text(body.email).toLowerCase();
  if (!email) errors.email = "Enter your email address.";
  else if (email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  const role = text(body.role);
  if (!role) errors.role = "Select your role.";
  else if (!(EARLY_ACCESS_ROLES as readonly string[]).includes(role)) errors.role = "Select a role from the list.";

  const company = text(body.company);
  if (company.length > MAX_COMPANY) errors.company = `Keep the company name under ${MAX_COMPANY} characters.`;

  const githubRaw = text(body.githubProfile);
  const githubProfile = githubRaw ? normalizeGitHubProfile(githubRaw) : null;
  if (githubRaw && !githubProfile) errors.githubProfile = "Enter a GitHub username or profile URL.";

  const selectedWorkflows = Array.isArray(body.selectedWorkflows)
    ? [...new Set(body.selectedWorkflows.filter((w): w is string => typeof w === "string"))]
    : [];
  if (selectedWorkflows.length === 0) errors.selectedWorkflows = "Select at least one workflow.";
  else if (selectedWorkflows.some((w) => !WORKFLOW_IDS.includes(w))) {
    errors.selectedWorkflows = "One of the selected workflows isn't recognized. Reselect and try again.";
  }

  const customUseCase = text(body.customUseCase);
  if (!customUseCase) errors.customUseCase = "Tell us what you'd want PawOS to help you with.";
  else if (customUseCase.length > MAX_USE_CASE) {
    errors.customUseCase = `Keep this under ${MAX_USE_CASE} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      email,
      role: role as EarlyAccessRole,
      company: company || null,
      githubProfile,
      selectedWorkflows: selectedWorkflows as EarlyAccessWorkflowId[],
      customUseCase,
    },
  };
}
