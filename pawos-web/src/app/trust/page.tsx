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
              Build an AI companion capable enough to be trusted with real work — and honest enough that the trust is
              earned, not assumed.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Vision</h2>
            <p className="mt-2">
              A desktop where the boundary between &ldquo;asking an AI for help&rdquo; and &ldquo;the work actually
              getting done&rdquo; disappears — without giving up the confirmation gates and honesty that make that
              safe.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Values</h2>
            <ul className="mt-2 space-y-2">
              <li>• <strong className="text-neutral-200">Honesty over polish.</strong> Every feature and runtime doc on this site lists real limitations next to real capabilities.</li>
              <li>• <strong className="text-neutral-200">Confirmed, not silent.</strong> Destructive and production-impacting actions are always gated.</li>
              <li>• <strong className="text-neutral-200">Outcome-based trust.</strong> Autonomous Engineering Task billing only fires on genuine completion — never on effort alone.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Why PawOS</h2>
            <p className="mt-2">
              Because most AI products optimize for a good demo. We&apos;d rather optimize for the version that&apos;s
              still trustworthy after you&apos;ve used it for six months on real work.
            </p>
          </div>
        </div>
      </Section>

      <Section className="border-t border-neutral-900 text-center">
        <p className="text-sm text-neutral-500">
          For the operational side of transparency, see{" "}
          <Link href="/status" className="text-blue-400 hover:underline">Status</Link>,{" "}
          <Link href="/roadmap" className="text-blue-400 hover:underline">Roadmap</Link>, and the{" "}
          <Link href="/changelog" className="text-blue-400 hover:underline">Changelog</Link>.
        </p>
      </Section>
    </>
  );
}
