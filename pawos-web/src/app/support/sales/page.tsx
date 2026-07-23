import type { Metadata } from "next";
import { Section } from "../../../components/ui/Section";
import { Button } from "../../../components/ui/Button";

export const metadata: Metadata = { title: "Sales", description: "Talk to the PawOS team about Enterprise plans." };

export default function SalesPage() {
  return (
    <Section title="Talk to sales" subtitle="For Enterprise pricing, volume Autonomous Engineering Task rates, and custom deployment questions.">
      <div className="mx-auto mt-10 max-w-md text-center">
        <p className="text-neutral-400">
          A dedicated sales contact channel is being finalized. In the meantime, open a GitHub Issue labeled
          &ldquo;enterprise&rdquo; and we&apos;ll follow up.
        </p>
        <Button href="https://github.com/RevantaAIproduction/Pawos/issues/new" external className="mt-6 w-full">
          Contact us on GitHub
        </Button>
      </div>
    </Section>
  );
}
