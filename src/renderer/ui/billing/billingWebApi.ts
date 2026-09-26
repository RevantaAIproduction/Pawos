import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import type { BillingWebResponse } from '../../../shared/billing/BillingTypes';

/** The part of a fetch Response the checkout code reads. */
export type BillingWebResult = { ok: boolean; status: number; json: () => Promise<any> };

function asResult(response: BillingWebResponse): BillingWebResult {
  return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
}

/**
 * POSTs JSON to a PawOS website billing endpoint. The desktop renderer runs from file://, so a relative
 * /api/... fetch reaches nothing — the main process makes the call (billing:postWebApi).
 */
export async function billingWebPost(path: string, payload: unknown): Promise<BillingWebResult> {
  return asResult(await ipc.billingPostWebApi(path, payload));
}

/** Uploads a payment-evidence file for a high-value invoice (through the main process, like billingWebPost). */
export async function uploadPaymentEvidence(fields: { accessToken: string; billingCaseId: string; invoiceId: string }, file: File): Promise<BillingWebResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return asResult(await ipc.billingUploadPaymentEvidence({ ...fields, fileName: file.name, fileType: file.type, bytes }));
}
