/**
 * TEMPORARY — debug-only event bus for the Debug Voice panel. Remove this
 * file, its emit() calls in GeminiSttProvider.ts/ConversationRuntime.ts,
 * and VoiceDebugPanel.tsx together once real-microphone verification is done.
 */
export type VoiceDebugEvent =
  | { type: 'mic'; deviceLabel: string }
  | { type: 'level'; level: number; elapsedMs: number }
  | { type: 'stage'; label: string; status: 'ok' | 'error' | 'info'; detail?: string }
  | { type: 'recorded'; sizeBytes: number; durationMs: number; mimeType: string }
  | { type: 'request'; url: string; mimeType: string; audioBytes: number }
  | { type: 'response'; status: number; bodyPreview: string }
  | { type: 'transcript'; text: string }
  | { type: 'runtime'; event: string; data?: Record<string, unknown> };

type Listener = (event: VoiceDebugEvent) => void;

class VoiceDebugBus {
  private listeners = new Set<Listener>();

  emit(event: VoiceDebugEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const voiceDebugBus = new VoiceDebugBus();
