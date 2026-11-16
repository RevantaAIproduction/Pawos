import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";

export const metadata: Metadata = { title: "Trust & Transparency", description: "PawOS's mission, values, and how we handle honesty about the product." };

export default function TrustPage() {
  return (
    <>
      <Section title="Trust & Transparency">
        <div className="mx-auto max-w-2xl space-y-10 text-neutral-400">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Mission</h2>
            <p className="mt-2">
              Build software that can help with engineering work, while making its limits and required approvals clear.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Vision</h2>
            <p className="mt-2">
              A practical way to move from an engineering request to supported work and a reviewable result.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Values</h2>
            <ul className="mt-2 space-y-2">
              <li>• <strong className="text-neutral-200">Clear product boundaries.</strong> Desktop, CLI and Web have different access and supported actions.</li>
              <li>• <strong className="text-neutral-200">Review before action.</strong> Approval requirements depend on the action, experience and organization settings.</li>
              <li>• <strong className="text-neutral-200">Evidence over assumptions.</strong> Review the work and checks PawOS reports before relying on a result.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Why PawOS</h2>
            <p className="mt-2">
              Engineering work often crosses project files, commands and connected services. PawOS is being built to help with those steps without treating every task or integration as the same.
            </p>
          </div>
        </div>
      </Section>

      <Section className="border-t border-neutral-900 text-center">
        <p className="text-sm text-neutral-500">
          For the operational side of transparency, see{" "}
          <Link href="/status" className="text-blue-400 hover:underline">Status</Link> and the{" "}
          <Link href="/changelog" className="text-blue-400 hover:underline">Changelog</Link>.
        </p>
      </Section>
    </>
  );
}
