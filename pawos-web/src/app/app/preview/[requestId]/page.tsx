import type { Metadata } from "next";
import { PreviewOpener } from "./PreviewOpener";

export const metadata: Metadata = { title: "Live preview" };

/** Signed-in only (the /app layout); the change itself is read with the account's own session. */
export default async function PreviewPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <PreviewOpener requestId={requestId} />;
}
