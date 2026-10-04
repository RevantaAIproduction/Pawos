import { randomUUID } from "crypto";
import type { AccountContext } from "../account/accountContext";
import { createServiceClient } from "../supabase/serviceClient";
import { WEB_POLICY, WebCapabilityError, requireWebCapability, type WebImageMimeType } from "../webPolicy/webCapabilities";
import { WebChatError } from "./errors";

/**
 * Photo attachments for PawOS Web chat — from a phone's camera or photo library, or a desktop file
 * picker. The browser sends the photo to pawos-web, which checks it and stores it in the private
 * 'web-chat-uploads' bucket (service role only; see 20261004020000_web_tier_architecture.sql). The
 * photo never lives only in the browser, and the browser never gets storage credentials: it reads a
 * photo back through GET /api/web-chat/uploads/<id>, which checks the session and ownership.
 *
 * The type is decided from the file's bytes, not from its name or the type the browser claims.
 */

export const WEB_CHAT_UPLOADS_BUCKET = "web-chat-uploads";
const UPLOAD_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export interface WebChatAttachment {
  id: string;
  kind: "image";
  name: string;
  mimeType: WebImageMimeType;
  sizeBytes: number;
}

type AttachmentRow = { id: string; kind: string; file_name: string; mime_type: string; size_bytes: number; storage_path: string; message_id: string | null; chat_id: string | null };

/** The image type of these bytes, or null when they are not a supported photo. */
export function sniffImageType(bytes: Uint8Array): WebImageMimeType | null {
  const at = (offset: number, ...values: number[]) => values.every((value, index) => bytes[offset + index] === value);
  const ascii = (offset: number, text: string) => at(offset, ...Array.from(text, (char) => char.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftyp")) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heim", "heis"].includes(brand)) return "image/heif";
  }
  return null;
}

function cleanName(name: string, mimeType: WebImageMimeType): string {
  const cleaned = name.replace(/[^\w .()+-]/g, "_").trim().slice(0, WEB_POLICY.maxAttachmentNameChars);
  return cleaned || `photo.${mimeType.split("/")[1]}`;
}

function toAttachment(row: AttachmentRow): WebChatAttachment {
  return { id: row.id, kind: "image", name: row.file_name, mimeType: row.mime_type as WebImageMimeType, sizeBytes: row.size_bytes };
}

const COLUMNS = "id, kind, file_name, mime_type, size_bytes, storage_path, message_id, chat_id";

async function findByUploadId(account: AccountContext, uploadId: string): Promise<AttachmentRow | null> {
  const { data } = await account.supabase.from("web_chat_attachments").select(COLUMNS).eq("user_id", account.user.id).eq("client_upload_id", uploadId).maybeSingle();
  return (data as AttachmentRow | null) ?? null;
}

/**
 * Stores one uploaded photo for the account. `uploadId` is the browser's id for this upload: an
 * upload retried after its response was lost returns the photo already stored.
 */
export async function createUpload(account: AccountContext, file: unknown, uploadId: unknown): Promise<WebChatAttachment> {
  try {
    requireWebCapability(account, "web.fileUpload");
  } catch (error) {
    throw new WebChatError("capability_locked", error instanceof WebCapabilityError ? error.message : "Attachments aren't available.", 403);
  }
  if (typeof uploadId !== "string" || !UPLOAD_ID_PATTERN.test(uploadId)) throw new WebChatError("invalid_attachment", "That upload couldn't be read. Please try again.", 400);
  if (!(file instanceof Blob)) throw new WebChatError("invalid_attachment", "Choose a photo to attach.", 400);

  const existing = await findByUploadId(account, uploadId);
  if (existing) return toAttachment(existing);

  if (file.size === 0) throw new WebChatError("invalid_attachment", "That photo is empty.", 400);
  if (file.size > WEB_POLICY.maxImageBytes) {
    throw new WebChatError("invalid_attachment", `Attach a photo of up to ${Math.round(WEB_POLICY.maxImageBytes / (1024 * 1024))} MB.`, 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImageType(bytes);
  if (!mimeType) throw new WebChatError("invalid_attachment", "Attach a PNG, JPEG, WebP or HEIC photo.", 415);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await account.supabase.from("web_chat_attachments").select("id", { count: "exact", head: true }).eq("user_id", account.user.id).gte("created_at", since);
  if (recent.error) throw new WebChatError("failed", "Couldn't upload that photo. Please try again.", 500);
  if ((recent.count ?? 0) >= WEB_POLICY.maxImageUploadsPerDay) {
    throw new WebChatError("upload_limit_reached", "You've uploaded a lot of photos today. Try again tomorrow.", 429);
  }

  const id = randomUUID();
  const storagePath = `${account.user.id}/${id}`;
  const service = createServiceClient();
  const uploaded = await service.storage.from(WEB_CHAT_UPLOADS_BUCKET).upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploaded.error) {
    console.error("[web-chat] photo upload failed");
    throw new WebChatError("failed", "Couldn't upload that photo. Please try again.", 500);
  }
  const name = cleanName(file instanceof File ? file.name : "", mimeType);
  const inserted = await service.from("web_chat_attachments").insert({
    id,
    user_id: account.user.id,
    client_upload_id: uploadId,
    kind: "image",
    mime_type: mimeType,
    file_name: name,
    size_bytes: bytes.byteLength,
    storage_path: storagePath,
  });
  if (inserted.error) {
    await service.storage.from(WEB_CHAT_UPLOADS_BUCKET).remove([storagePath]).then(undefined, () => undefined);
    // A parallel retry of the same upload got there first.
    const raced = await findByUploadId(account, uploadId);
    if (raced) return toAttachment(raced);
    throw new WebChatError("failed", "Couldn't upload that photo. Please try again.", 500);
  }
  return { id, kind: "image", name, mimeType, sizeBytes: bytes.byteLength };
}

/** One of the account's own photos (row-level security hides everyone else's), or null. */
async function ownAttachment(account: AccountContext, id: unknown): Promise<AttachmentRow | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await account.supabase.from("web_chat_attachments").select(COLUMNS).eq("id", id).eq("user_id", account.user.id).maybeSingle();
  if (error || !data) return null;
  return data as AttachmentRow;
}

async function download(row: AttachmentRow): Promise<Uint8Array | null> {
  const { data, error } = await createServiceClient().storage.from(WEB_CHAT_UPLOADS_BUCKET).download(row.storage_path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** A photo to send with a new message: the account's own, not yet attached to another message. */
export async function loadAttachmentForSend(account: AccountContext, id: unknown): Promise<{ attachment: WebChatAttachment; data: Uint8Array }> {
  const row = await ownAttachment(account, id);
  if (!row || row.message_id) throw new WebChatError("invalid_attachment", "That photo is no longer available. Attach it again.", 400);
  const data = await download(row);
  if (!data) throw new WebChatError("failed", "Couldn't read that photo. Please try again.", 500);
  return { attachment: toAttachment(row), data };
}

/** A photo for display to its owner, or null. */
export async function readUpload(account: AccountContext, id: unknown): Promise<{ attachment: WebChatAttachment; data: Uint8Array } | null> {
  const row = await ownAttachment(account, id);
  if (!row) return null;
  const data = await download(row);
  return data ? { attachment: toAttachment(row), data } : null;
}

/** Photos attached to the messages of one chat, keyed by message id. */
export async function attachmentsByMessage(account: AccountContext, chatId: string): Promise<Map<string, WebChatAttachment[]>> {
  const result = new Map<string, WebChatAttachment[]>();
  const { data, error } = await account.supabase.from("web_chat_attachments").select(COLUMNS).eq("chat_id", chatId).eq("user_id", account.user.id);
  if (error) return result; // photos are an addition to the thread; the text still loads without them
  for (const row of (data ?? []) as AttachmentRow[]) {
    if (!row.message_id) continue;
    result.set(row.message_id, [...(result.get(row.message_id) ?? []), toAttachment(row)]);
  }
  return result;
}
