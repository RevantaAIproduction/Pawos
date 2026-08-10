import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { crossDeviceRuntimeClient } from './CrossDeviceRuntimeClient';
import type { ConversationMessage, ConversationSnapshot } from '../conversation/ConversationTypes';

const SUMMARY_MAX_LENGTH = 240;

/** The text shown on the phone for a pending confirmation — the assistant's own confirmation question when available (it already flows through conversationSnapshot.messages), never a fabricated description of what's being confirmed. */
export function deriveApprovalSummary(lastMessage: ConversationMessage | undefined): string {
  if (!lastMessage || lastMessage.role !== 'assistant') {
    return 'PawOS needs your approval to continue.';
  }
  const trimmed = lastMessage.content.trim();
  if (!trimmed) return 'PawOS needs your approval to continue.';
  return trimmed.length > SUMMARY_MAX_LENGTH ? `${trimmed.slice(0, SUMMARY_MAX_LENGTH).trimEnd()}…` : trimmed;
}

/**
 * Approval Center (MOB-9) — the desktop-side half of a Cross Device Runtime
 * bridge, not a new confirmation mechanism. ConversationRuntime already has
 * exactly one pending-confirmation slot (see its pendingConfirmation field
 * and the "yes"/"no" interception in handleTranscript) — this only mirrors
 * that single boolean (ConversationSnapshot.pendingConfirmation, an additive
 * field) onto the phone as an 'approvalRequired' event, and forwards the
 * phone's tap back through submitTranscript('yes'|'no') exactly as if the
 * user had spoken or typed the reply on the desktop itself. No new backend
 * approval queue, no direct action execution from the phone.
 *
 * requestId correlation exists only to ignore a stale response arriving
 * after the confirmation was already resolved on the desktop (e.g. the user
 * answered by voice before tapping the phone) — it is generated here, not by
 * ConversationRuntime, since the runtime's own model never needed one.
 */
export function useApprovalCenterBridge(snapshot: ConversationSnapshot, submitTranscript: (transcript: string) => void): void {
  const { user } = useAuth();
  const [available, setAvailable] = useState(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const wasPendingRef = useRef(false);

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
    if (snapshot.pendingConfirmation && !wasPendingRef.current) {
      const requestId = crypto.randomUUID();
      activeRequestIdRef.current = requestId;
      const summary = deriveApprovalSummary(snapshot.messages[snapshot.messages.length - 1]);
      crossDeviceRuntimeClient
        .publish('approvalRequired', 'approvalCenter', { requestId, summary }, { userId: user.id })
        .catch(() => {});
    } else if (!snapshot.pendingConfirmation) {
      activeRequestIdRef.current = null;
    }
    wasPendingRef.current = snapshot.pendingConfirmation;
  }, [snapshot.pendingConfirmation, snapshot.messages, user, available]);

  useEffect(() => {
    if (!user || user.isGuest || !available) return;
    const unsubscribe = crossDeviceRuntimeClient.subscribeToEvents(user.id, (event) => {
      if (event.eventType !== 'approvalResponse') return;
      const requestId = typeof event.payload.requestId === 'string' ? event.payload.requestId : null;
      if (!requestId || requestId !== activeRequestIdRef.current) return;
      activeRequestIdRef.current = null;
      submitTranscript(event.payload.approved === true ? 'yes' : 'no');
    });
    return unsubscribe;
  }, [user, available, submitTranscript]);
}
