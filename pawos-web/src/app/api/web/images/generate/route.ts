import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../../lib/account/api";
import { ImageGenerationError, generateImage } from "../../../../../lib/webImages/imageGeneration";
import { WebChatError } from "../../../../../lib/webChat/errors";

/**
 * POST /api/web/images/generate — one image, for PawOS Web and PawOS Desktop alike.
 *
 *   { requestId, prompt, aspectRatio?, imageSize? }
 *
 * Signed-in accounts only (session cookie, or a bearer token from the desktop app). The price is
 * held before the model is called and charged only when a real image is stored; the same requestId
 * again returns that image instead of making (and charging) another. See lib/webImages/imageGeneration.ts.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as unknown;
  try {
    const image = await generateImage(guard.account, body);
    return NextResponse.json({ ok: true, image });
  } catch (error) {
    if (error instanceof WebChatError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
          ...(error instanceof ImageGenerationError && error.actions ? { actions: error.actions } : {}),
          ...(error.detail ? { detail: error.detail } : {}),
        },
        { status: error.status }
      );
    }
    console.error("[web-images] unexpected failure");
    return NextResponse.json({ ok: false, code: "failed", message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
