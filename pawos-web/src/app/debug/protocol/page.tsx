import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProtocolDebugClient } from "./ProtocolDebugClient";

export const metadata: Metadata = {
  title: "Protocol Debug",
  robots: { index: false, follow: false },
};

/** A developer tool for testing the pawos:// hand-off. Not served in production. */
export default function ProtocolDebugPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-2xl flex-col px-6 py-16">
      <ProtocolDebugClient />
    </div>
  );
}
