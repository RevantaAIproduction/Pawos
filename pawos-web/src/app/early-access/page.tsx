import type { Metadata } from "next";
import { EarlyAccessSection } from "../../components/early-access/EarlyAccessSection";

export const metadata: Metadata = {
  title: "Early Access",
  description:
    "PawOS is preparing for its next release. Join Early Access to see real engineering workflows and be among the first to try it.",
};

/** Shareable standalone home for the same Early Access section the homepage renders. */
export default function EarlyAccessPage() {
  return (
    <div className="pt-16">
      <EarlyAccessSection placement="page" />
    </div>
  );
}
