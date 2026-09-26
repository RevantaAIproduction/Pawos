import type { ConversationSessionSummary } from '../../shared/conversation/ConversationSessionTypes';

/** One section of the chat list: plain chats (folder null) or one project's chats. */
export type ChatGroup = { folder: string | null; name: string; chats: ConversationSessionSummary[] };

/** Last path segment — "C:\code\my-app" → "my-app". */
export function folderName(folder: string): string {
  return folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folder;
}

function folderKey(folder: string | null | undefined): string {
  return (folder ?? '').trim().replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}

/**
 * The chat list: "Chats" (plain chats — resumes, questions — no project) first, then one section per
 * project folder, most recently active first. The open project always gets a section (so a new chat can
 * be started in it) unless the list is filtered by a search. Inside a section: pinned first, then newest.
 * Archived chats are hidden.
 */
export function groupChatsByProject(
  chats: readonly ConversationSessionSummary[],
  openProject: string | null = null,
  searching = false
): ChatGroup[] {
  const order = (a: ConversationSessionSummary, b: ConversationSessionSummary) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt;
  const plain: ChatGroup = { folder: null, name: 'Chats', chats: [] };
  const projects = new Map<string, ChatGroup>();
  for (const chat of chats) {
    if (chat.archived) continue;
    if (!chat.projectFolder) {
      plain.chats.push(chat);
      continue;
    }
    const key = folderKey(chat.projectFolder);
    const group = projects.get(key) ?? { folder: chat.projectFolder, name: folderName(chat.projectFolder), chats: [] };
    group.chats.push(chat);
    projects.set(key, group);
  }
  if (openProject && !searching && !projects.has(folderKey(openProject))) {
    projects.set(folderKey(openProject), { folder: openProject, name: folderName(openProject), chats: [] });
  }
  const latest = (g: ChatGroup) => Math.max(0, ...g.chats.map((c) => c.updatedAt));
  const projectGroups = [...projects.values()].sort((a, b) => latest(b) - latest(a));
  for (const group of [plain, ...projectGroups]) group.chats.sort(order);
  return [...(plain.chats.length > 0 || !searching ? [plain] : []), ...projectGroups];
}

/** A chat's list title: its saved title, else its last message, else "Untitled chat". */
export function chatTitle(chat: Pick<ConversationSessionSummary, 'title' | 'lastMessage'>): string {
  const title = chat.title.trim() || chat.lastMessage.trim();
  return title ? (title.length > 80 ? `${title.slice(0, 79)}…` : title) : 'Untitled chat';
}
