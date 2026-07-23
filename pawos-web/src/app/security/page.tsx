import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";

export const metadata: Metadata = {
  title: "Security",
  description: "How PawOS handles encryption, authentication, permissions, credentials, and safety checks.",
};

const TOPICS: { title: string; body: string }[] = [
  { title: "Encryption", body: "Organization-shared infrastructure credentials are stored in an encrypted vault, never in plain text. Data in transit to Supabase and third-party AI providers uses standard TLS encryption." },
  { title: "Authentication", body: "Individual accounts use Supabase Auth (email or Google OAuth). Organization membership is verified against a shared email domain before access is granted." },
  { title: "Permissions", body: "Access within an Organization Workspace is role-based, with temporary elevated permissions scoped to a specific task rather than permanent role changes." },
  { title: "Runtime isolation", body: "Each runtime (Universal Execution, Browser, Infrastructure, Communication, Companion, Governance) operates through its own plugin contract, limiting how far a failure or misuse in one area can reach into another." },
  { title: "Secrets & credential storage", body: "Individual-use infrastructure connectors rely on your own already-authenticated CLI/API sessions rather than PawOS storing your cloud credentials. Organization-shared secrets go through the encrypted credential vault." },
  { title: "Data handling", body: "Most data stays local to your device by default. See our Privacy Policy and Data Processing Agreement for full detail." },
  { title: "Local execution", body: "Universal Execution Runtime actions run on your own machine, under the same OS-level permissions your user account already has — PawOS does not escalate privileges." },
  { title: "Cloud providers", body: "Every hosting/cloud connector shells to that provider's own official CLI or API using your own authenticated session. PawOS never manages your cloud provider credentials on your behalf." },
  { title: "Responsible AI", body: "See our Responsible AI Usage policy for our commitments around honest task reporting and your responsibilities when reviewing AI-proposed actions." },
  { title: "Safety checks", body: "Actions are classified as routine, destructive, or production-impacting before they run, with confirmation or organization approval required for the latter two." },
  { title: "Execution approval", body: "Organizations can configure approval policies requiring a human sign-off before specific action types (like production deploys) run, backed by a real approval queue." },
  { title: "Autonomous Engineering safety", body: "Autonomous Ticket Resolution's deploy step (where applicable) goes through the same approval gating as a manual deploy request, and billing is gated on genuine completion, never on partial or failed work." },
  { title: "Incident reporting", body: "See our Vulnerability Disclosure Policy for how to responsibly report a security issue." },
  { title: "Security best practices", body: "Authenticate infrastructure CLIs with least-privilege credentials where your provider supports it, scope organization approval policies to genuinely risky actions, and review confirmation prompts before approving them." },
];

export default function SecurityPage() {
  return (
    <>
      <Section title="Security" subtitle="The concrete mechanisms behind PawOS's safety and security claims.">
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {TOPICS.map((t) => (
            <div key={t.title} className="rounded-xl border border-neutral-800 p-6">
              <h3 className="font-semibold text-neutral-100">{t.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{t.body}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section className="border-t border-neutral-900 text-center">
        <p className="text-sm text-neutral-500">
          Related: <Link href="/legal/security-policy" className="text-blue-400 hover:underline">Security Policy</Link>,{" "}
          <Link href="/legal/vulnerability-disclosure-policy" className="text-blue-400 hover:underline">Vulnerability Disclosure</Link>,{" "}
          <Link href="/legal/compliance-information" className="text-blue-400 hover:underline">Compliance Information</Link>
        </p>
      </Section>
    </>
  );
}
