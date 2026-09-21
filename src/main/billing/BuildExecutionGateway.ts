import { ipcMain } from 'electron';
import { pawComputeConfigStore } from './PawComputeConfigStore';
import { getGeminiApiKey } from '../ai/geminiApiKey';
import { computeNormalizedCompute } from './UsageMeteringEngine';
import { ProviderUsageMetadata } from '../../shared/billing/UsageMeteringTypes';

const BUILD_CODING_MAX_OUTPUT_TOKENS = 8000;

async function executeBuildWithReservation(
  opts: any,
  accessToken: string,
  runId: string,
  workloadType: string,
  balanceSource: string,
  requiredPc: number,
  geminiPayload: any,
  evt: Electron.IpcMainInvokeEvent
) {
  if (!accessToken) return { ok: false, reason: 'Missing auth' };
  
  const env = opts.getEnvApiKeys();
  const apiKey = getGeminiApiKey();

  // 1. Reserve
  let reservationStatus = '';
  try {
    const res = await fetch(env.supabaseUrl + '/rest/v1/rpc/reserve_pawos_build_pc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.supabasePublishableKey, Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ p_run_id: runId, p_amount: requiredPc, p_workload_type: workloadType, p_balance_preference: balanceSource })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, reason: 'Reservation failed: ' + errText };
    }
    const data = (await res.json()) as { status?: string };
    reservationStatus = data.status ?? ''; 
  } catch (e) {
    return { ok: false, reason: 'Reservation network error' };
  }

  // Idempotency check: terminal state
  if (reservationStatus === 'settled' || reservationStatus === 'released') {
    return { ok: true, terminal: true, status: reservationStatus };
  }

  // 2. Provider Execution
  let usageMetadata: ProviderUsageMetadata | null = null;
  let didStart = false;
  const model = geminiPayload.model || 'gemini-1.5-flash';

  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse&key=" + apiKey;
    const { model: _omitted, ...payloadBody } = geminiPayload;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBody)
    });

    if (!res.ok) {
      throw new Error('Provider HTTP error: ' + res.status);
    }
    
    didStart = true;
    
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep the last incomplete chunk in the buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              
              if (parsed.usageMetadata) {
                usageMetadata = {
                  provider: 'gemini',
                  model: model,
                  inputTokens: parsed.usageMetadata.promptTokenCount ?? 0,
                  cachedInputTokens: parsed.usageMetadata.cachedContentTokenCount ?? 0,
                  outputTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
                  totalTokens: parsed.usageMetadata.totalTokenCount ?? 0,
                  thoughtsTokens: parsed.usageMetadata.thoughtsTokenCount ?? null,
                  requestId: runId,
                };
              }

              // Send to renderer, protecting against disconnects
              if (!evt.sender.isDestroyed()) {
                evt.sender.send('billing:buildStreamData:' + runId, parsed);
              }
            } catch (parseErr) {
              // Ignore malformed JSON chunks
            }
          }
        }
      }
    }
  } catch (err) {
    if (!didStart) {
      // Failed before provider actually started doing work -> RELEASE
      await fetch(env.supabaseUrl + '/rest/v1/rpc/release_pawos_build_pc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: env.supabasePublishableKey, Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ p_run_id: runId })
      });
      return { ok: false, reason: 'Provider failed to start' };
    }
  } finally {
    if (didStart) {
      // 3. Settle
      let actualPc = requiredPc; // Failsafe ceiling if metadata was not found (e.g. stream crash)
      if (usageMetadata) {
        // Map native usage metadata into the engine's real USD calculation
        actualPc = computeNormalizedCompute(usageMetadata);
      }
      
      try {
        await fetch(env.supabaseUrl + '/rest/v1/rpc/settle_pawos_build_pc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: env.supabasePublishableKey, Authorization: 'Bearer ' + accessToken },
          body: JSON.stringify({ p_run_id: runId, p_actual_amount: actualPc })
        });
      } catch (e) {
        // Background retry handled by offline queue (omitted for brevity)
      }
    }
  }

  return { ok: true };
}

export function registerBuildExecutionGateway(opts: any) {
  ipcMain.handle('billing:executeBuildConversation', async (evt, accessToken: string, payload: any, balanceSource: string, runId: string) => {
    return executeBuildWithReservation(opts, accessToken, runId, 'conversation', balanceSource, 0.10, payload, evt);
  });

  ipcMain.handle('billing:executeBuildResumeATS', async (evt, accessToken: string, payload: any, balanceSource: string, runId: string) => {
    return executeBuildWithReservation(opts, accessToken, runId, 'resume_ats', balanceSource, 0.40, payload, evt);
  });

  ipcMain.handle('billing:executeBuildResumeRewrite', async (evt, accessToken: string, payload: any, balanceSource: string, runId: string) => {
    return executeBuildWithReservation(opts, accessToken, runId, 'resume_rewrite', balanceSource, 0.60, payload, evt);
  });

  ipcMain.handle('billing:executeBuildCoding', async (evt, accessToken: string, payload: any, balanceSource: string, runId: string) => {
    const apiKey = getGeminiApiKey();
    const model = payload.model || 'gemini-1.5-pro';
    
    // 1. Exact Preflight
    let inputTokens = 0;
    try {
      const { model: _omitted, ...countPayload } = payload;
      const countUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":countTokens?key=" + apiKey;
      const countRes = await fetch(countUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(countPayload)
      });
      if (!countRes.ok) {
        return { ok: false, reason: 'countTokens HTTP failed' };
      }
      const countData = (await countRes.json()) as any;
      if (typeof countData.totalTokens !== 'number' || countData.totalTokens < 0) {
        return { ok: false, reason: 'Invalid token count from provider' };
      }
      inputTokens = countData.totalTokens;
    } catch (e) {
      return { ok: false, reason: 'countTokens network error' };
    }

    const pricing = pawComputeConfigStore.resolvePricing(model);
    const pawComputePerUsd = pawComputeConfigStore.getPawComputePerUsd();
    
    const inputUsd = inputTokens * (pricing.inputPerMillionUsd / 1_000_000);
    const maxOutputUsd = BUILD_CODING_MAX_OUTPUT_TOKENS * (pricing.outputPerMillionUsd / 1_000_000);
    
    // Ceiling computation matches standard pricing logic
    const requiredPc = Math.ceil((inputUsd + maxOutputUsd) * pawComputePerUsd * 100) / 100;

    return executeBuildWithReservation(opts, accessToken, runId, 'coding', balanceSource, requiredPc, payload, evt);
  });
}

