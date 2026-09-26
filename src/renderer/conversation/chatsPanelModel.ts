import type { ConversationSessionSummary } from '../../shared/conversation/ConversationSessionTypes';

export type ChatGroup = { label: string; chats: ConversationSessionSummary[] };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Chats panel list: archived chats hidden, pinned first, then Today / Yesterday / Previous 7 days /
 * Older by last activity (newest first). Empty groups are left out.
 */
export function groupChats(chats: readonly ConversationSessionSummary[], now = Date.now()): ChatGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const visible = chats.filter((c) => !c.archived).sort((a, b) => b.updatedAt - a.updatedAt);

  const groups: ChatGroup[] = [
    { label: 'Pinned', chats: visible.filter((c) => c.pinned) },
    { label: 'Today', chats: [] },
    { label: 'Yesterday', chats: [] },
    { label: 'Previous 7 days', chats: [] },
    { label: 'Older', chats: [] },
  ];
  for (const chat of visible) {
    if (chat.pinned) continue;
    const index = chat.updatedAt >= today ? 1 : chat.updatedAt >= today - DAY_MS ? 2 : chat.updatedAt >= today - 7 * DAY_MS ? 3 : 4;
    groups[index]!.chats.push(chat);
  }
  return groups.filter((g) => g.chats.length > 0);
}

/** A chat's list title: its saved title, else its last message, else "Untitled chat". */
export function chatTitle(chat: Pick<ConversationSessionSummary, 'title' | 'lastMessage'>): string {
  const title = chat.title.trim() || chat.lastMessage.trim();
  return title ? (title.length > 80 ? `${title.slice(0, 79)}…` : title) : 'Untitled chat';
}
