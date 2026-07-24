export type ThemeMode = 'dark' | 'light' | 'system';

export type SettingsState = {
  selectedPetId: string;
  animationSpeed: number;
  soundVolume: number;
  startWithWindows: boolean;
  enableKeyboardReactions: boolean;
  enableMouseReactions: boolean;
  muted: boolean;
  notifyOnTaskComplete: boolean;
  themeMode: ThemeMode;
  /** BCP-47 code (e.g. 'en-US', 'fr-FR') for push-to-talk speech recognition — see SpeechProviders.ts. Set from the profile menu's Language picker. */
  speechLanguage: string;
};

export type PetInfo = { id: string; name: string };

export type FeedbackSubmission = { rating: number; comment?: string };

export type HelpActivityState = {
  viewCounts: Record<string, number>;
  recentlyViewed: string[];
};

export type SupportConversationStatus = 'new' | 'investigating' | 'aiFixing' | 'waitingPermission' | 'resolved' | 'closed';

export type SupportConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  matchedArticleIds?: string[];
};

export type SupportConversation = {
  id: string;
  createdAt: number;
  updatedAt: number;
  problemSummary: string;
  status: SupportConversationStatus;
  diagnosis: string;
  actionsTaken: string[];
  currentState: string;
  needsPermission: boolean;
  turns: SupportConversationTurn[];
  supportRating?: 'up' | 'down';
  negativeFeedbackDetail?: string;
};

