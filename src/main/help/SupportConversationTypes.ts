export type SupportConversationStatus = 'new' | 'investigating' | 'aiFixing' | 'waitingPermission' | 'resolved' | 'closed';

export type SupportConversationAttachment = {
  name: string;
  /** Small screenshots/logs only — stored inline as a data URL, no separate file store. */
  dataUrl: string;
  kind: 'image' | 'file';
};

export type SupportConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Article ids used as grounding context for this assistant turn, if any. */
  matchedArticleIds?: string[];
  /** Screenshots or files the user attached to this message — for the record and for a human/self-healing reviewer, not read by the AI provider (no vision input in this pipeline yet). */
  attachments?: SupportConversationAttachment[];
};

export type SupportConversation = {
  id: string;
  createdAt: number;
  updatedAt: number;
  problemSummary: string;
  status: SupportConversationStatus;
  diagnosis: string;
  /** Stays empty in Phase 1 — populated once Phase 2's log/state/config inspection lands. */
  actionsTaken: string[];
  currentState: string;
  needsPermission: boolean;
  turns: SupportConversationTurn[];
  supportRating?: 'up' | 'down';
  negativeFeedbackDetail?: string;
};
