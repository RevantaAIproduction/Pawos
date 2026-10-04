import { redirect } from "next/navigation";
import { getAccountContext } from "../../lib/account/accountContext";
import { getUsageOverview } from "../../lib/account/usage";
import { getAllowance, getChatMessages, messageLimitFor, type WebChatAllowance, type WebChatMessage } from "../../lib/webChat/webChat";
import { WEB_POLICY, resolveWebCapabilities } from "../../lib/webPolicy/webCapabilities";
import { getCodeChangeReadiness, type CodeChangeReadiness } from "../../lib/webCode/repository";
import { latestChangeForChat } from "../../lib/webCode/changeWatch";
import { WorkspaceChat } from "../../components/workspace/WorkspaceChat";

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ chat?: string; plan?: string }> }) {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  const { chat, plan } = await searchParams;

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
  const allowance: WebChatAllowance = await getAllowance(account).catch(() => ({ messageLimit: limit, period: limit === null ? null : account.tier === "go" ? "lifetime" : "week", messagesUsed: 0, remaining: limit }));

  // Display only: the send endpoint checks the capability and the allowance again on every message.
  const capabilities = resolveWebCapabilities(account);
  const fileUpload = capabilities.find((capability) => capability.id === "web.fileUpload");
  const handoff = capabilities.find((capability) => capability.id === "web.continueInDesktop");
  // Paid tiers run on the plan's existing allowance — the same one the desktop app draws on.
  const usage = limit === null ? await getUsageOverview(account).catch(() => null) : null;
  const planBucket = usage?.buckets.find((bucket) => bucket.type === "monthly_plan") ?? usage?.buckets[0];

  // Display only: Change mode is checked again on the server on every change. If it can't be read
  // (the selection table isn't there yet), Change mode shows what is missing rather than failing.
  const frontendChanges: CodeChangeReadiness = await getCodeChangeReadiness(account).catch((): CodeChangeReadiness => ({ state: "githubNotConnected" }));
  const initialChange = chatId ? await latestChangeForChat(account, chatId).catch(() => null) : null;

  // `key` resets the thread when the user switches chats or starts a new one.
  return (
    <WorkspaceChat
      key={chatId ?? "new"}
      chatId={chatId}
      initialMessages={messages}
      initialAllowance={allowance}
      canAttach={fileUpload?.status === "available"}
      attachAvailableOn={fileUpload?.availableOn ?? null}
      canHandoff={handoff?.status === "available"}
      maxAttachmentBytes={WEB_POLICY.maxAttachmentBytes}
      maxImageBytes={WEB_POLICY.maxImageBytes}
      frontendChanges={frontendChanges}
      promptLimit={account.tier === "go" ? { lines: WEB_POLICY.goMaxPromptLines, chars: WEB_POLICY.goMaxPromptChars } : null}
      initialChange={initialChange}
      openPlan={plan === "1"}
      maxMessageChars={WEB_POLICY.maxMessageChars}
      planUsage={usage && planBucket ? { percentUsed: planBucket.percentUsed, limitReached: usage.limitReached } : null}
    />
  );
}
