import type { Metadata } from "next";
import { Section } from "../../../components/ui/Section";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contact", description: "How to reach the PawOS team." };

export default function ContactPage() {
  return (
    <Section title="Contact" subtitle="Send us a message and we'll get back to you.">
      <ContactForm />
      <p className="mt-6 text-center text-sm text-neutral-500">
        Enterprise or sales inquiries? See the dedicated <a href="/support/sales" className="text-blue-400 hover:underline">Sales</a> page.
      </p>
    </Section>
  );
}
