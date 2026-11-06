import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Section } from "../../components/ui/Section";

export const metadata: Metadata = {
  title: "Privacy & Security",
  description: "How PawOS handles your project data, AI requests, account access, and integrations.",
};

type Topic = {
  title: string;
  body: string;
  icon: "training" | "privacy" | "processing" | "workspace" | "integrations" | "payment";
};

const TOPICS: Topic[] = [
  {
    title: "Your work is not model-training data",
    body: "PawOS does not use your private project data or conversations to train PawOS-managed models. You can use PawOS's available AI capabilities without training your own model on private project data.",
    icon: "training",
  },
  {
    title: "Your content is not for sale",
    body: "PawOS does not sell customer project content or conversations. Your content may be processed when needed to provide a feature you request, as described below and in the Privacy Policy.",
    icon: "privacy",
  },
  {
    title: "Processing follows the work you request",
    body: "A request may involve processing your prompt, selected project context, or attachments to provide an AI response or carry out an authorized task. PawOS Web stores chat records and uploaded images in its services so the product can provide chat history and related features.",
    icon: "processing",
  },
  {
    title: "Account and workspace access controls",
    body: "PawOS Web requires an authenticated account for private chat and attachment routes. Requests are checked against the signed-in account, and chat records are queried within that account's scope. Organization workspaces use membership and role controls for shared data.",
    icon: "workspace",
  },
  {
    title: "You choose connected services",
    body: "You decide which integrations to connect and approve the access a provider requests. PawOS applies product and tool permissions to supported actions. A provider grant can cover broader access than one task; disconnecting in PawOS removes its stored connection, and you may also need to revoke access with that provider.",
    icon: "integrations",
  },
  {
    title: "Your private data is not payment",
    body: "You do not need to surrender project files, conversations, or other private data to use PawOS, and PawOS does not accept that data as payment. Paid features are charged through the plan or usage terms shown in PawOS.",
    icon: "payment",
  },
];

const ICON_PATHS: Record<Topic["icon"], ReactNode> = {
  training: <><path d="M12 3v2" /><path d="M5.6 5.6 7 7" /><path d="M3 12h2" /><path d="m5.6 18.4 1.4-1.4" /><path d="M12 19v2" /><path d="m18.4 18.4-1.4-1.4" /><path d="M19 12h2" /><path d="m18.4 5.6-1.4 1.4" /><circle cx="12" cy="12" r="4" /><path d="m10.5 12 1 1 2-2" /></>,
  privacy: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="M9 12h6" /></>,
  processing: <><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="M8 9h8M8 12h5" /></>,
  workspace: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M8 5V3h8v2" /><path d="m10 14 1.4 1.4L14.5 12" /></>,
  integrations: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.5-3.6M8.2 13.2l7.5 3.6" /></>,
  payment: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></>,
};

function TopicIcon({ name }: { name: Topic["icon"] }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-700/80 bg-neutral-900 text-neutral-300" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[name]}
      </svg>
    </span>
  );
}

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-neutral-950">
      <section className="relative overflow-hidden border-b border-neutral-900 px-6 pb-16 pt-32 sm:pb-20 sm:pt-40">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_58%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Privacy &amp; Security</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-6xl">Your Data. Your Work. Your Control.</h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-neutral-300 sm:text-lg sm:leading-8">
            PawOS is built with a privacy-first approach. Your private project data and conversations are not used to train PawOS-managed models. Information is processed to deliver the functionality you request, with access governed by your account and the permissions you authorize.
          </p>
        </div>
      </section>

      <Section
        eyebrow="Our approach"
        title="Privacy in the way PawOS works"
        subtitle="Clear boundaries for AI processing, project access, and connected accounts."
        className="bg-black"
      >
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic) => (
            <article key={topic.title} className="group rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 transition-colors hover:border-neutral-700 sm:p-7">
              <TopicIcon name={topic.icon} />
              <h2 className="mt-5 text-lg font-semibold tracking-tight text-white">{topic.title}</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">{topic.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="AI request handling"
        title="What happens when you ask PawOS for help?"
        subtitle="AI features need to process the context required to answer or perform the task you ask for."
        className="border-t border-neutral-900 bg-neutral-950"
      >
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { number: "01", title: "You make a request", text: "You choose the task and, where applicable, the project, repository, files, or integration involved." },
            { number: "02", title: "PawOS processes relevant context", text: "PawOS Web sends AI requests to Google's Gemini API. The request may include your prompt and context needed for the requested response or task." },
            { number: "03", title: "The result is handled by PawOS", text: "Web chat records and uploaded images are stored by PawOS services for product functionality. Task execution uses the account and integration permissions involved in that task." },
          ].map((step) => (
            <div key={step.number} className="rounded-2xl border border-neutral-800 bg-black p-6 sm:p-7">
              <p className="text-xs font-semibold tracking-[0.18em] text-blue-300">{step.number}</p>
              <h3 className="mt-4 text-base font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-6 sm:p-7">
          <div className="flex gap-4">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-amber-200/80" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 2.8 19a1.3 1.3 0 0 0 1.1 2h16.2a1.3 1.3 0 0 0 1.1-2L12 3Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            <div>
              <h3 className="font-semibold text-neutral-100">Provider data-use terms need production confirmation</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                Google&apos;s Gemini API terms differ between paid and unpaid service. Paid services state that prompts and responses are not used to improve Google products, while unpaid services may use submitted content and responses to improve products and machine-learning technologies. This repository confirms the Gemini API integration, but not the production project&apos;s billing status or account-level data settings. We therefore do not make a blanket claim here about Google&apos;s training use or retention for PawOS production traffic.
              </p>
              <p className="mt-3 text-sm">
                <a className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini API Additional Terms</a>
                <span className="mx-2 text-neutral-600">·</span>
                <a className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200" href="https://ai.google.dev/gemini-api/docs/zdr" target="_blank" rel="noreferrer">Gemini API data retention information</a>
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Storage & choices"
        title="Understand where your data lives"
        subtitle="PawOS Web uses cloud services for account, chat, and attachment features. Storage and deletion are governed by the current Privacy Policy and service terms."
        className="border-t border-neutral-900 bg-black"
      >
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
          <ul className="space-y-4 text-sm leading-6 text-neutral-400">
            <li><span className="font-medium text-neutral-200">Chat and files.</span> PawOS Web stores chat records and uploaded images with its services to provide chat history and related features. The current Privacy Policy describes account-data retention; no automatic deletion schedule is promised here.</li>
            <li><span className="font-medium text-neutral-200">Account deletion.</span> PawOS provides an account deletion flow that requires confirmation. The flow removes account records and stored uploads, while billing records or records required by law may be retained. Payment processors and AI providers may have their own records and retention terms.</li>
            <li><span className="font-medium text-neutral-200">Connected accounts.</span> You can disconnect supported integrations in PawOS. Depending on the provider, you may also need to remove PawOS&apos;s authorization in that provider&apos;s settings.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-neutral-800 pt-5 text-sm">
            <Link href="/legal/privacy-policy" className="text-blue-300 hover:text-blue-200">Read the Privacy Policy <span aria-hidden="true">→</span></Link>
            <Link href="/legal/data-processing-agreement" className="text-blue-300 hover:text-blue-200">Organization Data Processing Agreement <span aria-hidden="true">→</span></Link>
            <Link href="/legal/security-policy" className="text-blue-300 hover:text-blue-200">Security Policy <span aria-hidden="true">→</span></Link>
            <Link href="/legal/vulnerability-disclosure-policy" className="text-blue-300 hover:text-blue-200">Report a security issue <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </Section>

      <Section className="border-t border-neutral-900 bg-neutral-950 text-center">
        <p className="mx-auto max-w-2xl text-sm leading-6 text-neutral-500">
          Security and privacy depend on the product feature, account configuration, and connected provider. This page describes current PawOS Web behavior and does not claim a certification, end-to-end encryption, or a guarantee against security incidents.
        </p>
      </Section>
    </main>
  );
}
