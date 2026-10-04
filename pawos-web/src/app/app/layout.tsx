import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../lib/account/accountContext";
import { listChats, type WebChatSummary } from "../../lib/webChat/webChat";
import { WorkspaceShell } from "../../components/workspace/WorkspaceShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PawOS Web",
  robots: { index: false, follow: false },
};

// Phones: let the page use the area behind the notch/home bar (the workspace pads it back with
// safe-area insets) and shrink the layout when the on-screen keyboard opens, so the composer stays
// above it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#141414",
};

/**
 * PawOS Web (/app) — the signed-in chat workspace. This layout is the sign-in gate for every page
 * under it; the chat data and the send endpoint are separately protected on the server.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const account = await getAccountContext();
  if (!account) redirect("/login");

  let chats: WebChatSummary[] = [];
  try {
    chats = await listChats(account);
  } catch {
    chats = []; // the chat tables may not exist yet; the workspace still opens
  }

  return (
    <WorkspaceShell
      account={{
        displayName: account.displayName,
        email: account.user.email ?? null,
        avatarUrl: account.avatarUrl,
        tierLabel: account.tierLabel,
        canUpgrade: account.tier === "go" || account.tier === "pro" || account.tier === "build",
      }}
      chats={chats}
    >
      {children}
    </WorkspaceShell>
  );
}
