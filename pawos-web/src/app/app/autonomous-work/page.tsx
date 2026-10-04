import type { Metadata } from "next";
import { DesktopFeaturePage } from "../../../components/workspace/DesktopFeaturePage";

export const metadata: Metadata = { title: "Autonomous Work" };

export default function WorkspaceAutonomousWorkPage() {
  return (
    <DesktopFeaturePage
      title="Autonomous Work"
      summary="Hand PawOS a ticket and it carries the work through on your machine."
      points={[
        "Reads the ticket from Jira, Linear or GitHub Issues and gathers context from your repository",
        "Makes the code changes and verifies them locally",
        "Reports what it did and updates the ticket",
      ]}
      docsHref="/docs/autonomous-ticket-resolution"
    />
  );
}
