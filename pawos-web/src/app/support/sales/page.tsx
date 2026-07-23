import type { Metadata } from "next";
import { Section } from "../../../components/ui/Section";
import { Button } from "../../../components/ui/Button";
import { mailto } from "../../../lib/config/contactConfig";

export const metadata: Metadata = { title: "Sales", description: "Talk to the PawOS team about Enterprise plans." };

export default function SalesPage() {
  return (
    <Section title="Talk to sales" subtitle="For Enterprise pricing, volume Autonomous Engineering Task rates, and custom deployment questions.">
      <div className="mx-auto mt-10 max-w-md text-center">
        <p className="text-neutral-400">Email our sales team directly and we&apos;ll follow up.</p>
        <Button href={mailto("sales", "PawOS Enterprise inquiry")} external className="mt-6 w-full">
          Email Sales
        </Button>
      </div>
    </Section>
  );
}
