import type { Metadata } from "next";
import { EarlyAccessSection } from "../../components/early-access/EarlyAccessSection";

export const metadata: Metadata = {
  title: "Early Access",
  description:
    "Register your interest in PawOS Early Access and tell the team which engineering workflows matter to you.",
};

/** Shareable standalone home for the same Early Access section the homepage renders. */
export default function EarlyAccessPage() {
  return (
    <div className="pt-16">
      <EarlyAccessSection placement="page" />
    </div>
  );
}
