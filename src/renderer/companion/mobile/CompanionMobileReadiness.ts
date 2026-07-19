import type { CompanionProfile } from '../manager/CompanionProfileTypes';
import type { CompanionMobilePayload } from './CompanionMobileTypes';

/**
 * Real, correct mapping from a desktop CompanionProfile to the reserved
 * mobile payload shape — genuine groundwork, not a stub. Nothing calls this
 * today: there is no mobile client and no transport wired to send its
 * result anywhere (pairing already lets a device register, but no channel
 * exists yet for actually pushing a companion to one). This exists so that
 * work is already done once a mobile client and a real sync channel exist.
 */
export function buildCompanionMobilePayload(profile: CompanionProfile): CompanionMobilePayload {
  return {
    companionId: profile.id,
    name: profile.name,
    skinId: profile.skinId,
    avatarImage: profile.avatarImage,
    personality: { preset: profile.personality.preset, traits: profile.personality.traits },
    voice: { ttsProvider: profile.voice.ttsProvider, voiceId: profile.voice.voiceId, speed: profile.voice.speed },
    behavior: { greetingStyle: profile.behavior.greetingStyle, idleBehavior: profile.behavior.idleBehavior },
  };
}
