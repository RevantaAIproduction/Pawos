import { NextResponse } from "next/server";
import { requireAccount } from "../../../../../lib/account/api";
import { readGeneratedImage } from "../../../../../lib/webImages/imageGeneration";

/**
 * GET /api/web/images/<id> — a generated image, for the account that made it only. ?download=1
 * asks the browser to save it. Images are never public: there is no other way to read them.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const image = await readGeneratedImage(guard.account, id);
  if (!image) return NextResponse.json({ ok: false, code: "not_found", message: "That image doesn't exist." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
  return new NextResponse(Buffer.from(image.bytes), {
    status: 200,
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(download ? { "Content-Disposition": `attachment; filename="pawos-image-${id.slice(0, 8)}.${extension}"` } : {}),
    },
  });
}
