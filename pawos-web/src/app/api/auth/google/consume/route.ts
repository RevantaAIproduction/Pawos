import { consumeGoogleAuthPayload } from "../../../../../lib/googleAuthRelayStore";

/**
 * Electron fetches this exactly once, immediately after receiving the short
 * `pawos://google-auth-callback?ref=...` deep link — see googleAuthRelayStore.ts's doc comment
 * for why the real id_token/access_token aren't in that deep link at all. The ref is itself the
 * capability: single-use, ~2 minute TTL, deleted on first read regardless of outcome.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ref = searchParams.get("ref");
  if (!ref) return Response.json({ error: "missing_ref" }, { status: 400 });

  const payload = consumeGoogleAuthPayload(ref);
  if (!payload) return Response.json({ error: "ref_not_found_or_expired" }, { status: 404 });

  return Response.json(payload);
}
