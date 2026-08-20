import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { aiProviderConfigStore } from './AIProviderConfigStore';

/**
 * Seeds the managed GEMINI_API_KEY from .env into aiProviderConfigStore before
 * the React tree mounts. Called once in index.tsx before createRoot().render()
 * so that aiProviderConfigStore.getApiKey('gemini') is never undefined during
 * the first render or any action dispatched from it.
 *
 * If GEMINI_API_KEY is absent from .env, the store is left unchanged (local
 * provider, no key) — preserving the existing missing-provider behavior exactly.
 * Never throws: an IPC failure is treated the same as a missing key.
 */
export async function seedManagedGeminiKey(): Promise<void> {
  try {
    const { gemini } = await ipc.envGetApiKeys();
    if (gemini) {
      aiProviderConfigStore.setApiKey('gemini', gemini);
    }
  } catch {
    // IPC failure — app continues with local provider, same as a missing key.
  }
}
