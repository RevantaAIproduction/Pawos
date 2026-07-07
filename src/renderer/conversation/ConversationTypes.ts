export type ConversationState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error'
  | 'waitingForPermission';

export type ConversationRole = 'system' | 'user' | 'assistant';

export type ConversationMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: number;
  status: 'final' | 'streaming';
};

export type ConversationSnapshot = {
  panelOpen: boolean;
  state: ConversationState;
  messages: ConversationMessage[];
  draftTranscript: string;
  errorMessage: string | null;
  supportsSpeechRecognition: boolean;
  supportsSpeechSynthesis: boolean;
};

export const conversationStateLabels: Record<ConversationState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  transcribing: 'Transcribing',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Error',
  waitingForPermission: 'Waiting for permission',
};

