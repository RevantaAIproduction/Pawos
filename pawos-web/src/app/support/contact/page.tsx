import type { Metadata } from "next";
import { Section } from "../../../components/ui/Section";
import { Button } from "../../../components/ui/Button";

export const metadata: Metadata = { title: "Contact", description: "How to reach the PawOS team." };

export default function ContactPage() {
  return (
    <Section title="Contact" subtitle="For bugs and feature requests, GitHub Issues is the fastest and most reliable channel today.">
      <div className="mx-auto mt-10 max-w-md text-center">
        <Button href="https://github.com/RevantaAIproduction/Pawos/issues/new" external className="w-full">
          Open a GitHub Issue
        </Button>
        <p className="mt-4 text-sm text-neutral-500">
          Enterprise or sales inquiries? See the dedicated <a href="/support/sales" className="text-blue-400 hover:underline">Sales</a> page.
        </p>
      </div>
    </Section>
  );
}
