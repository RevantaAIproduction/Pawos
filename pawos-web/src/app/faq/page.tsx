import type { Metadata } from "next";
import { Section } from "../../components/ui/Section";
import { FAQ_ITEMS } from "../../lib/faqContent";
import { FaqList } from "./FaqList";

export const metadata: Metadata = {
  title: "FAQ",
  description: "PawOS developer FAQ about PawOS, covering installation, billing, providers, enterprise, privacy, security, and more.",
};

export default function FaqPage() {
  return (
    <Section title="Frequently asked questions" subtitle="Answers about product experiences, local project access, setup, billing, permissions and supported workflows.">
      <div className="mt-12">
        <FaqList items={FAQ_ITEMS} />
      </div>
    </Section>
  );
}
