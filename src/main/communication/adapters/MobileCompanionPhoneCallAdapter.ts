import type { PhoneCallAdapter, PhoneCallCapability } from '../../../shared/communication/CommunicationTypes';
import { mobilePairingStore } from '../MobilePairingStore';

/**
 * First PhoneCallAdapter implementation — the Mobile Companion app. Honest
 * about the real gap: `isAvailable()` only ever returns true once a real,
 * non-revoked paired device exists (mobilePairingStore.list()), and even
 * then this session has no mobile client to actually stream call audio
 * from (the mobile app itself is explicitly out of scope — see
 * COMMUNICATION_INTELLIGENCE_RUNTIME.md's Explicitly Deferred section).
 * beginSession()/endSession() are real, functioning session-lifecycle
 * calls the rest of the Communication Runtime (consent, storage, pipeline,
 * timeline, search, workspace) is built against today — a future mobile
 * client just needs to call communication:saveAudio the same way the
 * desktop capture path already does, and everything above this adapter
 * works unchanged.
 */
class MobileCompanionPhoneCallAdapter implements PhoneCallAdapter {
  readonly id = 'mobileCompanion';
  readonly displayName = 'Paw Mobile Companion';
  readonly capabilities = new Set<PhoneCallCapability>(['inboundCapture', 'outboundCapture', 'consentPrompt']);

  async isAvailable(): Promise<boolean> {
    return mobilePairingStore.list().some((d) => d.revokedAt === null);
  }

  async beginSession(): Promise<{ ok: true; data: { sessionId: string } } | { ok: false; message: string }> {
    const available = await this.isAvailable();
    if (!available) {
      return { ok: false, message: 'No paired mobile device is available to capture this call yet.' };
    }
    // A real session id is issued so the desktop-side lifecycle (consent,
    // CommunicationRecord, storage folder) is genuinely ready — the actual
    // call-audio stream from a real phone is the one piece still deferred.
    return { ok: true, data: { sessionId: `phonecall_${Date.now().toString(36)}` } };
  }

  async endSession(): Promise<{ ok: true }> {
    return { ok: true };
  }
}

export const mobileCompanionPhoneCallAdapter = new MobileCompanionPhoneCallAdapter();
