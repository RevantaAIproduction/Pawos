import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../auth/supabaseClient';
import type { ShareScope, SignalingAnswerPayload, SignalingIceCandidatePayload, SignalingOfferPayload } from '../../shared/organization/RemoteAssistanceTypes';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Phase 5 — screen sharing transport. WebRTC (Electron/Chromium's built-in
 * RTCPeerConnection) for the actual video, with signaling (offer/answer/ICE
 * candidate exchange) carried over a Supabase Realtime broadcast channel —
 * reusing the exact same channel mechanism Phase 4's WorkspacePresenceService
 * and SharedDocumentSession already use, rather than standing up the
 * separate signaling service the roadmap's architecture diagram sketches.
 * This keeps the "no new backend paradigm" principle from Section 0 intact:
 * Supabase Realtime is the one signaling transport this whole project needs.
 *
 * Capture uses `getDisplayMedia` (the modern, Electron-recommended screen/
 * window capture API), the same mechanism already proven in
 * CommunicationAudioCapture.ts for system-audio capture — no desktopCapturer/
 * contextBridge plumbing, no new IPC channel.
 */
export class ScreenShareHostSession {
  private pc: RTCPeerConnection | null = null;
  private channel: RealtimeChannel | null = null;
  private stream: MediaStream | null = null;

  /** Starts capture (the OS's native picker constrains it to desktop/window per `scope`) and waits for the viewer to connect. */
  async start(sessionId: string, scope: ShareScope, selfUserId: string): Promise<{ sourceLabel: string }> {
    const displayMediaOptions: DisplayMediaStreamOptions =
      scope === 'window' ? { video: { displaySurface: 'window' } as MediaTrackConstraints } : { video: true };
    this.stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

    const supabase = await getSupabaseClient();
    const channel = supabase.channel(`screen-share-signal:${sessionId}`, { config: { broadcast: { self: false } } });

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.stream.getTracks().forEach((track) => pc.addTrack(track, this.stream!));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channel.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { candidate: event.candidate.toJSON(), fromUserId: selfUserId } satisfies SignalingIceCandidatePayload,
        });
      }
    };

    channel.on('broadcast', { event: 'request-offer' }, async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channel.send({ type: 'broadcast', event: 'offer', payload: { sdp: offer.sdp, fromUserId: selfUserId } satisfies SignalingOfferPayload });
    });

    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      const { sdp } = payload as SignalingAnswerPayload;
      await pc.setRemoteDescription({ type: 'answer', sdp });
    });

    channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
      const { candidate } = payload as SignalingIceCandidatePayload;
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // Late/duplicate candidates are expected and harmless to drop.
      }
    });

    await new Promise<void>((resolve) => channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()));

    this.pc = pc;
    this.channel = channel;
    const track = this.stream.getVideoTracks()[0];
    return { sourceLabel: track?.label ?? scope };
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.pc?.close();
    this.pc = null;
    await this.channel?.unsubscribe();
    this.channel = null;
  }
}

export class ScreenShareViewerSession {
  private pc: RTCPeerConnection | null = null;
  private channel: RealtimeChannel | null = null;

  async connect(sessionId: string, selfUserId: string, onStream: (stream: MediaStream) => void): Promise<void> {
    const supabase = await getSupabaseClient();
    const channel = supabase.channel(`screen-share-signal:${sessionId}`, { config: { broadcast: { self: false } } });

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.ontrack = (event) => onStream(event.streams[0]);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channel.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { candidate: event.candidate.toJSON(), fromUserId: selfUserId } satisfies SignalingIceCandidatePayload,
        });
      }
    };

    channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      const { sdp } = payload as SignalingOfferPayload;
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channel.send({ type: 'broadcast', event: 'answer', payload: { sdp: answer.sdp, fromUserId: selfUserId } satisfies SignalingAnswerPayload });
    });

    channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
      const { candidate } = payload as SignalingIceCandidatePayload;
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // Late/duplicate candidates are expected and harmless to drop.
      }
    });

    await new Promise<void>((resolve) => channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()));
    channel.send({ type: 'broadcast', event: 'request-offer', payload: {} });

    this.pc = pc;
    this.channel = channel;
  }

  async disconnect(): Promise<void> {
    this.pc?.close();
    this.pc = null;
    await this.channel?.unsubscribe();
    this.channel = null;
  }
}
