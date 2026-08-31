/**
 * Mobile Pairing Client — Used by the PawOS Mobile PWA to complete pairing
 * and manage persistent sessions.
 *
 * This file documents the client-side interface. In the actual pawos-web app,
 * similar logic would be implemented in TypeScript/React.
 *
 * Security model:
 * - Token never stored in localStorage (only IndexedDB for PWA sessions)
 * - Session tokens are bound to the device_id via backend
 * - All verification happens server-side
 * - Tokens are revocable at any time
 */

import { getSupabaseClient } from '../auth/supabaseClient';
import type { SecurityKeyVerificationResult } from '../../shared/mobilePresence/MobileAuthTypes';

/**
 * Mobile session data stored in IndexedDB (not localStorage).
 * Survives browser reload, cleared on cache clear.
 */
export interface MobileSessionData {
  sessionToken: string;
  deviceId: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

const MOBILE_SESSION_STORE_KEY = 'pawos:mobile:session';

/**
 * MobilePairingClient — Client-side mobile pairing interface.
 * Used in the /pair/[sessionId] page and for session management.
 */
export const mobilePairingClient = {
  /**
   * confirmQRScan — Complete the QR pairing on the mobile side.
   * Called after mobile has scanned the QR and extracted sessionId + token.
   *
   * Returns the mobile device_id if successful.
   */
  async confirmQRScan(sessionId: string, token: string): Promise<string> {
    const supabase = await getSupabaseClient();

    // Call: complete_pairing_session(token, device_name, device_type, platform, browser, capabilities)
    const { data, error } = await supabase.rpc('complete_pairing_session', {
      p_token: token,
      p_device_name: `PawOS Mobile (${this.getDeviceName()})`,
      p_device_type: 'pwa',
      p_platform: this.getPlatform(),
      p_browser: this.getBrowser(),
      p_capabilities: JSON.stringify(this.getCapabilities()),
    }) as { data: string | null; error: Error | null };

    if (error) {
      throw new Error(`QR pairing failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('QR pairing returned no device ID');
    }

    return data;
  },

  /**
   * verifySecurityKey — Verify the Security Key entered by the user.
   * Returns: { success, deviceId, sessionToken }
   */
  async verifySecurityKey(sessionId: string, keyPlain: string): Promise<SecurityKeyVerificationResult> {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase.rpc('verify_pairing_security_key', {
      p_session_id: sessionId,
      p_key_plain: keyPlain,
    }) as unknown as {
      data: {
        success: boolean;
        device_id: string;
        session_token: string;
        expires_at: string;
      } | null;
      error: Error | null;
    };

    if (error) {
      return {
        success: false,
        error: error.message || 'Verification failed',
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: 'Verification returned invalid result',
      };
    }

    return {
      success: true,
      deviceId: data.device_id,
      sessionToken: data.session_token,
      expiresAt: data.expires_at,
    };
  },

  /**
   * storeSessionToken — Save the persistent session token to IndexedDB.
   * NOT localStorage (which is more exposed).
   */
  async storeSessionToken(session: MobileSessionData): Promise<void> {
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction(['sessions'], 'readwrite');
      const store = tx.objectStore('sessions');
      await new Promise((resolve, reject) => {
        const req = store.put(session, MOBILE_SESSION_STORE_KEY);
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.error('Failed to store session token:', err);
      throw err;
    }
  },

  /**
   * getStoredSessionToken — Retrieve the persistent session token from IndexedDB.
   */
  async getStoredSessionToken(): Promise<MobileSessionData | null> {
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');

      return new Promise((resolve, reject) => {
        const req = store.get(MOBILE_SESSION_STORE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.error('Failed to retrieve session token:', err);
      return null;
    }
  },

  /**
   * validateSessionToken — Check if the stored session is still valid on the backend.
   * Called on app reopen to auto-reconnect without re-pairing.
   */
  async validateSessionToken(sessionToken: string): Promise<boolean> {
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.rpc('validate_mobile_session', {
        p_session_token: sessionToken,
      });

      if (error) {
        console.error('Session validation failed:', error);
        return false;
      }

      return !!data;
    } catch (err) {
      console.error('Session validation error:', err);
      return false;
    }
  },

  /**
   * deleteStoredSessionToken — Clear the session from IndexedDB.
   * Called on disconnect, logout, or revocation.
   */
  async deleteStoredSessionToken(): Promise<void> {
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction(['sessions'], 'readwrite');
      const store = tx.objectStore('sessions');

      return new Promise((resolve, reject) => {
        const req = store.delete(MOBILE_SESSION_STORE_KEY);
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.error('Failed to delete session token:', err);
      throw err;
    }
  },

  /**
   * Private helpers
   */
  getDeviceName(): string {
    // e.g., "Chrome on iOS", "Safari on iPadOS"
    const ua = navigator.userAgent;
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('Mac')) return 'Mac';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Linux')) return 'Linux';
    return 'Mobile Device';
  },

  getPlatform(): string {
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'iOS';
    if (/Android/.test(navigator.userAgent)) return 'Android';
    if (/Mac/.test(navigator.userAgent)) return 'macOS';
    if (/Win/.test(navigator.userAgent)) return 'Windows';
    if (/Linux/.test(navigator.userAgent)) return 'Linux';
    return navigator.platform || 'unknown';
  },

  getBrowser(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  },

  getCapabilities() {
    return {
      pushNotifications: 'serviceWorker' in navigator, // Web Push API
      voice: 'webkitAudioContext' in window || 'AudioContext' in window,
      camera: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
      microphone: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
      biometrics: 'PublicKeyCredential' in window,
      offlineSupport: 'serviceWorker' in navigator,
      backgroundSync: 'serviceWorker' in navigator && 'SyncManager' in window,
    };
  },

  /**
   * IndexedDB setup — Create/get database
   */
  openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('pawos-mobile', 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
};
