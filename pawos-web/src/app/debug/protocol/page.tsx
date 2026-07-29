import type { Metadata } from "next";
import { ProtocolDebugClient } from "./ProtocolDebugClient";

export const metadata: Metadata = {
  title: "Protocol Debug",
  robots: { index: false, follow: false },
};

export default function ProtocolDebugPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-2xl flex-col px-6 py-16">
      <ProtocolDebugClient />
    </div>
  );
}
