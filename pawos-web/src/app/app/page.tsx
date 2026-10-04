import { redirect } from "next/navigation";
import { getAccountContext } from "../../lib/account/accountContext";
import { getUsageOverview } from "../../lib/account/usage";
import { getAllowance, getChatMessages, messageLimitFor, type WebChatAllowance, type WebChatMessage } from "../../lib/webChat/webChat";
import { WEB_POLICY, resolveWebCapabilities } from "../../lib/webPolicy/webCapabilities";
import { WorkspaceChat } from "../../components/workspace/WorkspaceChat";

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  const { chat } = await searchParams;

  let messages: WebChatMessage[] = [];
  let chatId: string | null = null;
  if (chat) {
    const loaded = await getChatMessages(account, chat).catch(() => null);
    if (!loaded) redirect("/app"); // not this account's chat, or it doesn't exist
    messages = loaded;
    chatId = chat;
  }

  const limit = messageLimitFor(account);
  // If the allowance can't be read, show the cap without a count; the server still enforces it on send.
  const allowance: WebChatAllowance = await getAllowance(account).catch(() => ({ messageLimit: limit, messagesUsed: 0, remaining: limit }));

  // Display only: the send endpoint checks the capability and the allowance again on every message.
  const fileUpload = resolveWebCapabilities(account).find((capability) => capability.id === "web.fileUpload");
  // Paid tiers run on the plan's existing allowance — the same one the desktop app draws on.
  const usage = limit === null ? await getUsageOverview(account).catch(() => null) : null;
  const planBucket = usage?.buckets.find((bucket) => bucket.type === "monthly_plan") ?? usage?.buckets[0];

  // `key` resets the thread when the user switches chats or starts a new one.
  return (
    <WorkspaceChat
      key={chatId ?? "new"}
      chatId={chatId}
      initialMessages={messages}
      initialAllowance={allowance}
      canAttach={fileUpload?.status === "available"}
      attachAvailableOn={fileUpload?.availableOn ?? null}
      maxAttachmentBytes={WEB_POLICY.maxAttachmentBytes}
      maxMessageChars={WEB_POLICY.maxMessageChars}
      planUsage={usage && planBucket ? { percentUsed: planBucket.percentUsed, limitReached: usage.limitReached } : null}
    />
  );
}
