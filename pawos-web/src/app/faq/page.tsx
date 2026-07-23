import type { Metadata } from "next";
import { Section } from "../../components/ui/Section";
import { FAQ_ITEMS } from "../../lib/faqContent";
import { FaqList } from "./FaqList";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about PawOS, covering installation, billing, providers, enterprise, privacy, security, and more.",
};

export default function FaqPage() {
  return (
    <Section title="Frequently asked questions" subtitle="Search or browse by category.">
      <div className="mt-12">
        <FaqList items={FAQ_ITEMS} />
      </div>
    </Section>
  );
}
