/**
 * Mobile Authentication IPC Handlers
 * Runs in Electron main process. Handles:
 * 1. Web authorization URL generation
 * 2. Security Key generation (calls backend RPC)
 * 3. Security Key verification (calls backend RPC)
 *
 * Security model:
 * - Main process is auth authority, not renderer
 * - All Supabase calls happen here
 * - No long-lived tokens passed to renderer
 * - Plaintext Security Key displayed in renderer but not persisted
 */

import { ipcMain } from 'electron';
import { createClient } from '@supabase/supabase-js';
import { deviceIdentityStore } from '../../device/DeviceIdentityStore';
import type { SecurityKeyChallenge, SecurityKeyVerificationResult } from '../../../shared/mobilePresence/MobileAuthTypes';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase not configured');
  }
  return createClient(url, anonKey);
}

/**
 * mobileAuth:getWebAuthorizationUrl
 * Returns the URL for web-based account authorization before pairing.
 * URL includes session ID and desktop device ID for binding.
 *
 * No secrets in URL — just identifiers for the backend to validate.
 */
export async function getWebAuthorizationUrl(sessionId: string): Promise<string> {
  const desktopIdentity = deviceIdentityStore.getIdentity();
  const baseUrl = process.env.PAWOS_WEB_URL || 'https://pawos.app';

  return `${baseUrl}/auth/mobile-pairing?session=${sessionId}&device=${desktopIdentity.deviceId}`;
}

/**
 * mobileAuth:generateSecurityKey
 * Called by Desktop after QR pairing succeeds (when 'devicePaired' event received).
 *
 * Calls backend RPC: create_pairing_security_key(sessionId)
 * Returns: { plaintext: "7K4P-92MX", expiresAt }
 *
 * Security notes:
 * - Backend generates the key (server-authoritative)
 * - Backend stores only bcrypt hash
 * - Plaintext returned ONCE to main process
 * - Main process does NOT persist plaintext
 * - Renderer receives plaintext only for display (ephemeral)
 * - Key expires after 2 minutes
 */
export async function generateSecurityKey(sessionId: string): Promise<SecurityKeyChallenge> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('create_pairing_security_key', {
      p_session_id: sessionId,
    }) as unknown as {
      data: { plaintext: string; expires_at: string } | null;
      error: Error | null;
    };

    if (error) {
      throw new Error(`Security Key generation failed: ${error.message}`);
    }

    if (!data || !data.plaintext) {
      throw new Error('Security Key generation returned no key');
    }

    return {
      plaintext: data.plaintext, // e.g., "7K4P-92MX"
      expiresAt: data.expires_at,
      sessionId,
      maxAttempts: 5,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to generate security key: ${message}`);
  }
}

/**
 * mobileAuth:verifySecurityKey
 * Called by Mobile after user enters the key.
 *
 * Calls backend RPC: verify_pairing_security_key(sessionId, key)
 * Backend verifies:
 * - Key matches bcrypt hash
 * - Key not expired
 * - Key not already used
 * - Attempt limit not exceeded (5 attempts)
 *
 * On success:
 * - Returns persistent session token for mobile to store
 * - Trusted device is now fully active
 * - Mobile can use session token for future connections
 *
 * On failure:
 * - Returns error
 * - Doesn't reveal whether key is wrong vs. expired vs. attempts exhausted
 */
export async function verifySecurityKey(
  sessionId: string,
  keyPlain: string
): Promise<SecurityKeyVerificationResult> {
  try {
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
      // Don't expose internal error details to renderer/mobile
      const message = error.message || 'Verification failed';
      if (message.includes('already been used')) {
        return {
          success: false,
          error: 'This security key has already been used.',
        };
      }
      if (message.includes('has expired')) {
        return {
          success: false,
          error: 'Security key has expired. Request a new one from Desktop.',
        };
      }
      if (message.includes('too many')) {
        return {
          success: false,
          error: 'Too many failed attempts. Start a new pairing from Desktop.',
        };
      }
      if (message.includes('does not match')) {
        return {
          success: false,
          error: 'Security key does not match. Please try again.',
        };
      }
      // Default safe error
      return {
        success: false,
        error: 'Could not verify security key. Please try again.',
      };
    }

    if (!data || !data.success || !data.session_token) {
      return {
        success: false,
        error: 'Verification returned invalid result.',
      };
    }

    return {
      success: true,
      deviceId: data.device_id,
      sessionToken: data.session_token,
      expiresAt: data.expires_at,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Verification error: ${message}`,
    };
  }
}

/**
 * Register all mobile auth IPC handlers.
 * Call this from src/main/ipc/ipc.ts during Electron initialization.
 */
export function registerMobileAuthHandlers(): void {
  ipcMain.handle('mobileAuth:getWebAuthorizationUrl', async (_event, sessionId: string) => {
    return await getWebAuthorizationUrl(sessionId);
  });

  ipcMain.handle('mobileAuth:generateSecurityKey', async (_event, sessionId: string) => {
    return await generateSecurityKey(sessionId);
  });

  ipcMain.handle('mobileAuth:verifySecurityKey', async (_event, sessionId: string, keyPlain: string) => {
    return await verifySecurityKey(sessionId, keyPlain);
  });
}
