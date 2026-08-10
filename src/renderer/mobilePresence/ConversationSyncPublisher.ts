import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { crossDeviceRuntimeClient } from './CrossDeviceRuntimeClient';
import type { ConversationMessage, ConversationSnapshot } from '../conversation/ConversationTypes';

const PREVIEW_MAX_LENGTH = 240;

/** Builds the payload published for a completed conversation turn — a short preview, never the full transcript, since this only ever needs to render as a live glance on the phone. */
export function buildConversationSyncPayload(message: ConversationMessage): { role: string; preview: string } {
  const trimmed = message.content.trim();
  const preview =
    trimmed.length > PREVIEW_MAX_LENGTH ? `${trimmed.slice(0, PREVIEW_MAX_LENGTH).trimEnd()}…` : trimmed;
  return { role: message.role, preview };
}

/**
 * Conversation Sync (MOB-8) — a Cross Device Runtime module, not a new
 * delivery mechanism (see MobilePresenceTypes.ts's file header): publishes
 * every newly-completed conversation turn as a `conversationMessage`
 * cross_device_event so a paired phone can show a live preview of what's
 * being said on the desktop. This is a one-way broadcast, not two-way chat —
 * there is no server-side AI endpoint yet for the phone to actually converse
 * with Paw, matching every other "no persistent backend" gap already
 * disclosed elsewhere in Mobile Presence.
 *
 * Deliberately does not touch ConversationRuntime.ts or
 * useConversationController.ts — it observes the same ConversationSnapshot
 * CompanionExperience.tsx already holds and reacts to new `status: 'final'`
 * messages, exactly like NotificationDispatcher (AppRoot.tsx) reacts to
 * cross_device_events for a signed-in, non-Guest, entitled account.
 */
export function useConversationSyncPublisher(snapshot: ConversationSnapshot): void {
  const { user } = useAuth();
  const [available, setAvailable] = useState(false);
  const lastPublishedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || user.isGuest) {
      setAvailable(false);
      return;
    }
    let cancelled = false;
    ipc
      .entitlementIsFeatureAvailable('crossDeviceSync')
      .then((result) => {
        if (!cancelled) setAvailable(result);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || user.isGuest || !available) return;
    const messages = snapshot.messages;
    const last = messages[messages.length - 1];
    if (!last || last.status !== 'final' || last.id === lastPublishedIdRef.current) return;
    lastPublishedIdRef.current = last.id;
    crossDeviceRuntimeClient
      .publish('conversationMessage', 'conversationSync', buildConversationSyncPayload(last), { userId: user.id })
      .catch(() => {});
  }, [snapshot.messages, user, available]);
}
