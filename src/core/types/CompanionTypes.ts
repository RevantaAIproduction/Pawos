export type CompanionId = string;

export type VoiceRef = {
  packId: string;
  voiceId: string;
  language: string;
  accent?: string;
  pitch?: number;
  rate?: number;
  emotion?: string;
};

export type LanguageRef = {
  packId: string;
  languageId: string;
};

export type AnimationPackRef = { packId: string };
export type ActionPackRef = { packId: string };
export type BehaviorPackRef = { packId: string };
export type TriggerPackRef = { packId: string };

export type Companion = {
  id: CompanionId;
  name: string;
  category: string;
  personality: Record<string, unknown>;

  voice: VoiceRef;
  language: LanguageRef;

  metadata: Record<string, unknown>;

  animations: AnimationPackRef;
  actions: ActionPackRef;
  behaviors: BehaviorPackRef;
  triggers: TriggerPackRef;

  runtime?: {
    state: 'active' | 'paused' | 'sleeping';
    startedAtMs: number;
  };
};

