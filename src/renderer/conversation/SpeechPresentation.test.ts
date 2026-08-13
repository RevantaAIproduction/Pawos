import { describe, expect, it } from 'vitest';
import { createSpeechPresentation, isExplicitSpeechRequest, isVoiceOutputOffRequest, isVoiceOutputOnRequest } from './SpeechPresentation';

describe('SpeechPresentation', () => {
  it('does not speak raw machine paths character by character', () => {
    expect(createSpeechPresentation('Created C:\\Users\\APPLE\\Downloads\\PawOS\\src\\components\\Dashboard.tsx')).toBe(
      'I referenced Dashboard.tsx. The full path is on screen.'
    );
  });

  it('summarizes commands and output instead of reading raw terminal text', () => {
    expect(createSpeechPresentation('Command:\nnpm run build\nOutput:\nwebpack compiled successfully')).toBe(
      'The production build passed. Full output is available on screen.'
    );
  });

  it('detects explicit speech and voice-output mode requests', () => {
    expect(isExplicitSpeechRequest('Speak that.')).toBe(true);
    expect(isVoiceOutputOnRequest('Turn Voice Output ON')).toBe(true);
    expect(isVoiceOutputOffRequest('turn voice output off')).toBe(true);
  });
});
