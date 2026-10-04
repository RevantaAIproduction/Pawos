import type { Metadata } from "next";
import { DesktopFeaturePage } from "../../../components/workspace/DesktopFeaturePage";

export const metadata: Metadata = { title: "Projects" };

export default function WorkspaceProjectsPage() {
  return (
    <DesktopFeaturePage
      title="Projects"
      summary="Open a project folder and PawOS works inside it."
      points={[
        "Explores the codebase, its dependencies and the relevant files",
        "Changes and refactors code, and runs commands in the terminal",
        "Works with Git and your connected source control",
      ]}
      docsHref="/docs"
    />
  );
}
