import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../lib/account/api";
import { WebChatError } from "../../../../lib/webChat/errors";
import { createUpload } from "../../../../lib/webChat/uploads";

/**
 * POST /api/web-chat/uploads (multipart: file, uploadId) — upload a photo to attach to a PawOS Web
 * chat message. Signed-in accounts whose plan includes `web.fileUpload` only; the type is checked
 * from the file's bytes and the size against the policy, on the server. Retrying with the same
 * `uploadId` returns the photo already stored.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;

  const form = await request.formData().catch(() => null);
  try {
    const attachment = await createUpload(guard.account, form?.get("file"), form?.get("uploadId"));
    return NextResponse.json({ ok: true, attachment });
  } catch (error) {
    if (error instanceof WebChatError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }
    console.error("[web-chat] upload failed unexpectedly");
    return NextResponse.json({ ok: false, code: "failed", message: "Couldn't upload that photo. Please try again." }, { status: 500 });
  }
}
