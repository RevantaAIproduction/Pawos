export type SupportConversationStatus = 'new' | 'investigating' | 'aiFixing' | 'waitingPermission' | 'resolved' | 'closed';

export type SupportConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Article ids used as grounding context for this assistant turn, if any. */
  matchedArticleIds?: string[];
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
