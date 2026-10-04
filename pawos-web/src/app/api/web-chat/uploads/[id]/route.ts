import { NextResponse } from "next/server";
import { requireAccount } from "../../../../../lib/account/api";
import { readUpload } from "../../../../../lib/webChat/uploads";

type RouteProps = { params: Promise<{ id: string }> };

/**
 * GET /api/web-chat/uploads/<id> — one of the signed-in account's own photos, for display in its
 * chat. Anyone else's id, or an unknown one, is 404. Served from the private bucket by the server;
 * the browser never receives a storage URL or credential.
 */
export async function GET(_request: Request, props: RouteProps) {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { id } = await props.params;
  const upload = await readUpload(guard.account, id).catch(() => null);
  if (!upload) return NextResponse.json({ ok: false, code: "not_found", message: "That photo doesn't exist." }, { status: 404 });
  return new NextResponse(Buffer.from(upload.data), {
    headers: {
      "Content-Type": upload.attachment.mimeType,
      "Content-Length": String(upload.data.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
