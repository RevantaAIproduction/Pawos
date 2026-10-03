"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { trackEvent } from "../analytics/Analytics";
import {
  EARLY_ACCESS_ROLES,
  EARLY_ACCESS_WORKFLOWS,
  earlyAccessWorkflowTitle,
  validateEarlyAccessInput,
  type EarlyAccessFieldErrors,
  type EarlyAccessWorkflowId,
} from "../../lib/earlyAccess";

type Stage = "form" | "submitting" | "registered" | "already";

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const WORKFLOW_ICONS: Record<EarlyAccessWorkflowId, ReactNode> = {
  "fix-bug": (
    <svg {...ICON_PROPS}>
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M12 11v9M10 4l1 2M14 4l-1 2M4 13h4M16 13h4M5 7l3 2M19 7l-3 2M5 19l3-2M19 19l-3-2" />
    </svg>
  ),
  "build-feature": (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  "resolve-ticket": (
    <svg {...ICON_PROPS}>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  "investigate-codebase": (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M9.5 9l-2 2 2 2M12.5 9l2 2-2 2" />
    </svg>
  ),
  "debug-test-failures": (
    <svg {...ICON_PROPS}>
      <path d="M9 3h6M10 3v6l-5.5 9.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3M7.5 15h9" />
    </svg>
  ),
  "refactor-code": (
    <svg {...ICON_PROPS}>
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  ),
  "prepare-git-change": (
    <svg {...ICON_PROPS}>
      <path d="M6 3v12M18 9a9 9 0 0 1-9 9" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
    </svg>
  ),
  "browser-research": (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
};

const INPUT_CLASSES =
  "w-full rounded-lg border bg-neutral-900/50 px-4 py-3 text-sm text-neutral-100 placeholder-neutral-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

function inputClasses(hasError: boolean) {
  return `${INPUT_CLASSES} ${hasError ? "border-red-500/70" : "border-neutral-800"}`;
}

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-neutral-300">
        {label}
        {optional && <span className="ml-2 font-normal text-neutral-600">Optional</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Pre-launch Early Access: pick the engineering work you'd hand PawOS, then register interest.
 * Interest collection only — submitting stores a registration via POST /api/early-access and
 * shows a confirmation. It never starts a download and never implies desktop access.
 * `placement` only labels analytics events (which page the section was rendered on).
 */
export function EarlyAccessSection({ placement = "home" }: { placement?: "home" | "page" }) {
  const [stage, setStage] = useState<Stage>("form");
  const [selected, setSelected] = useState<EarlyAccessWorkflowId[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [githubProfile, setGithubProfile] = useState("");
  const [customUseCase, setCustomUseCase] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — see /api/early-access
  const [errors, setErrors] = useState<EarlyAccessFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sectionRef = useRef<HTMLElement>(null);
  const workflowsRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const formStartedRef = useRef(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackEvent("early_access_view", { placement });
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [placement]);

  const done = stage === "registered" || stage === "already";

  useEffect(() => {
    if (done) confirmationRef.current?.focus();
  }, [done]);

  const clearError = (field: keyof EarlyAccessFieldErrors) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const toggleWorkflow = (id: EarlyAccessWorkflowId) => {
    const isSelected = selected.includes(id);
    setSelected(isSelected ? selected.filter((w) => w !== id) : [...selected, id]);
    if (!isSelected) trackEvent("workflow_selected", { workflow: id, placement });
    clearError("selectedWorkflows");
  };

  const markFormStarted = () => {
    if (formStartedRef.current) return;
    formStartedRef.current = true;
    trackEvent("early_access_form_started", { placement });
  };

  const focusFirstError = (fieldErrors: EarlyAccessFieldErrors) => {
    if (fieldErrors.selectedWorkflows) {
      workflowsRef.current?.scrollIntoView({ block: "center" });
      workflowsRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      return;
    }
    const order = ["name", "email", "role", "company", "githubProfile", "customUseCase"] as const;
    const first = order.find((field) => fieldErrors[field]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setSubmitError(null);

    const payload = { name, email, role, company, githubProfile, selectedWorkflows: selected, customUseCase };
    const validation = validateEarlyAccessInput(payload);
    if (!validation.ok) {
      setErrors(validation.errors);
      focusFirstError(validation.errors);
      return;
    }
    setErrors({});

    submittingRef.current = true;
    setStage("submitting");
    try {
      const response = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, website }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        errors?: EarlyAccessFieldErrors;
      };

      if (response.ok && data.ok) {
        trackEvent("early_access_submitted", { placement, workflow_count: selected.length });
        setStage("registered");
        return;
      }
      if (response.status === 409 && data.code === "duplicate") {
        setStage("already");
        return;
      }
      if (response.status === 400 && data.errors) {
        setErrors(data.errors);
        focusFirstError(data.errors);
      } else {
        setSubmitError(data.message ?? "Something went wrong. Please try again.");
      }
      setStage("form");
    } catch {
      setSubmitError("We couldn't reach PawOS. Check your connection and try again.");
      setStage("form");
    } finally {
      submittingRef.current = false;
    }
  };

  const submitting = stage === "submitting";

  return (
    <section
      id="early-access"
      ref={sectionRef}
      className="py-32 px-6 bg-black relative z-10 border-t border-neutral-900 scroll-mt-20"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 mb-6 tracking-wide">
            EARLY ACCESS
          </div>
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
            PawOS is preparing for its next release.
          </h2>
          <p className="text-xl text-neutral-400 leading-relaxed">
            See how PawOS can fit into your everyday engineering workflow. Join the early-access list and get real
            PawOS workflow demonstrations before the next release.
          </p>
          <p className="mt-6 text-lg text-neutral-300 leading-relaxed">
            PawOS doesn&apos;t just tell you how to do engineering work. It is designed to execute real engineering
            work.
          </p>
        </div>

        {done ? (
          <div
            ref={confirmationRef}
            tabIndex={-1}
            role="status"
            className="mx-auto mt-20 max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-950 p-8 md:p-12 text-center focus:outline-none"
          >
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-white">
              <svg {...ICON_PROPS}>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </div>
            <h3 className="text-2xl md:text-3xl font-medium tracking-tight text-white">
              {stage === "already"
                ? "You're already on the PawOS Early Access list."
                : "You're on the PawOS Early Access list."}
            </h3>
            <p className="mt-4 text-lg text-neutral-400 leading-relaxed">
              We&apos;re preparing the next PawOS release and will share real workflow demonstrations and
              early-access updates with you.
            </p>
            {stage === "registered" && selected.length > 0 && (
              <ul className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Workflows you selected">
                {selected.map((id) => (
                  <li
                    key={id}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-sm text-neutral-300"
                  >
                    {earlyAccessWorkflowTitle(id)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            {/* Step 1 — workflows */}
            <div className="mt-24">
              <div className="mx-auto max-w-3xl text-center mb-12">
                <h3 id="early-access-workflows-title" className="text-3xl font-medium tracking-tight text-white mb-4">
                  What would you give PawOS?
                </h3>
                <p className="text-lg text-neutral-400 leading-relaxed">
                  Tell us what kind of engineering work you would want PawOS to handle.
                </p>
              </div>

              <div
                ref={workflowsRef}
                role="group"
                aria-labelledby="early-access-workflows-title"
                aria-describedby={errors.selectedWorkflows ? "early-access-workflows-error" : "early-access-workflows-hint"}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                {EARLY_ACCESS_WORKFLOWS.map((workflow) => {
                  const isSelected = selected.includes(workflow.id);
                  return (
                    <button
                      key={workflow.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={submitting}
                      onClick={() => toggleWorkflow(workflow.id)}
                      className={`group relative h-full rounded-xl border p-6 text-left transition disabled:opacity-60 ${
                        isSelected
                          ? "border-neutral-400 bg-neutral-900"
                          : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900"
                      }`}
                    >
                      <span
                        className={`absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border transition ${
                          isSelected ? "border-white bg-white text-black" : "border-neutral-700 text-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className={`mb-4 block transition ${isSelected ? "text-white" : "text-neutral-500 group-hover:text-neutral-300"}`}>
                        {WORKFLOW_ICONS[workflow.id]}
                      </span>
                      <span className="block pr-6 text-lg font-medium text-neutral-100">{workflow.title}</span>
                      <span className="mt-2 block text-sm leading-relaxed text-neutral-400">{workflow.description}</span>
                    </button>
                  );
                })}
              </div>

              {errors.selectedWorkflows ? (
                <p id="early-access-workflows-error" role="alert" className="mt-4 text-center text-sm text-red-400">
                  {errors.selectedWorkflows}
                </p>
              ) : (
                <p id="early-access-workflows-hint" className="mt-4 text-center text-sm text-neutral-500" aria-live="polite">
                  {selected.length === 0
                    ? "Select every workflow that applies."
                    : `${selected.length} selected. Your selection is sent with the form below.`}
                </p>
              )}
            </div>

            {/* Step 2 — form */}
            <div className="mx-auto mt-24 max-w-2xl">
              <div className="text-center mb-10">
                <h3 className="text-3xl font-medium tracking-tight text-white">Join PawOS Early Access</h3>
              </div>

              <form
                ref={formRef}
                noValidate
                onSubmit={handleSubmit}
                onFocus={markFormStarted}
                aria-busy={submitting}
                className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 md:p-10 space-y-6"
              >
                <div className="grid gap-6 md:grid-cols-2">
                  <Field id="early-access-name" label="Full name" error={errors.name}>
                    <input
                      id="early-access-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      maxLength={120}
                      value={name}
                      disabled={submitting}
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? "early-access-name-error" : undefined}
                      onChange={(e) => {
                        setName(e.target.value);
                        clearError("name");
                      }}
                      className={inputClasses(Boolean(errors.name))}
                    />
                  </Field>
                  <Field id="early-access-email" label="Email address" error={errors.email}>
                    <input
                      id="early-access-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      value={email}
                      disabled={submitting}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? "early-access-email-error" : undefined}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearError("email");
                      }}
                      className={inputClasses(Boolean(errors.email))}
                    />
                  </Field>
                </div>

                <Field id="early-access-role" label="Role" error={errors.role}>
                  <select
                    id="early-access-role"
                    name="role"
                    value={role}
                    disabled={submitting}
                    aria-invalid={Boolean(errors.role)}
                    aria-describedby={errors.role ? "early-access-role-error" : undefined}
                    onChange={(e) => {
                      setRole(e.target.value);
                      clearError("role");
                    }}
                    className={`${inputClasses(Boolean(errors.role))} ${role ? "" : "text-neutral-500"}`}
                  >
                    <option value="" disabled>
                      Select your role
                    </option>
                    {EARLY_ACCESS_ROLES.map((option) => (
                      <option key={option} value={option} className="text-neutral-100">
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid gap-6 md:grid-cols-2">
                  <Field id="early-access-company" label="Company" optional error={errors.company}>
                    <input
                      id="early-access-company"
                      name="company"
                      type="text"
                      autoComplete="organization"
                      maxLength={160}
                      value={company}
                      disabled={submitting}
                      aria-invalid={Boolean(errors.company)}
                      aria-describedby={errors.company ? "early-access-company-error" : undefined}
                      onChange={(e) => {
                        setCompany(e.target.value);
                        clearError("company");
                      }}
                      className={inputClasses(Boolean(errors.company))}
                    />
                  </Field>
                  <Field id="early-access-github" label="GitHub profile" optional error={errors.githubProfile}>
                    <input
                      id="early-access-github"
                      name="githubProfile"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="github.com/username"
                      value={githubProfile}
                      disabled={submitting}
                      aria-invalid={Boolean(errors.githubProfile)}
                      aria-describedby={errors.githubProfile ? "early-access-github-error" : undefined}
                      onChange={(e) => {
                        setGithubProfile(e.target.value);
                        clearError("githubProfile");
                      }}
                      className={inputClasses(Boolean(errors.githubProfile))}
                    />
                  </Field>
                </div>

                <Field
                  id="early-access-use-case"
                  label="What would you want PawOS to help you with?"
                  error={errors.customUseCase}
                >
                  <textarea
                    id="early-access-use-case"
                    name="customUseCase"
                    rows={4}
                    maxLength={2000}
                    value={customUseCase}
                    disabled={submitting}
                    aria-invalid={Boolean(errors.customUseCase)}
                    aria-describedby={errors.customUseCase ? "early-access-use-case-error" : undefined}
                    onChange={(e) => {
                      setCustomUseCase(e.target.value);
                      clearError("customUseCase");
                    }}
                    className={`${inputClasses(Boolean(errors.customUseCase))} resize-y`}
                  />
                </Field>

                {/* Honeypot — hidden from people and assistive tech; only bots fill it in. */}
                <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                  <label htmlFor="early-access-website">Website</label>
                  <input
                    id="early-access-website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                {submitError && (
                  <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {submitError}
                  </p>
                )}

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
                  <p className="text-sm text-neutral-500">
                    We&apos;ll only use your details for PawOS early-access updates.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="shrink-0 rounded-full bg-white px-8 py-4 text-base font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Joining…" : "Join Early Access"}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
