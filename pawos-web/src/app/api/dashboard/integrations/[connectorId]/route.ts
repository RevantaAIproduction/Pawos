import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../../lib/account/api";
import { disconnectIntegration, getIntegration, isIntegrationEntitled, listIntegrations } from "../../../../../lib/account/integrations";
import { WEB_OAUTH_STATE_COOKIE, WEB_OAUTH_STATE_COOKIE_PATH, WEB_OAUTH_STATE_MAX_AGE_SECONDS, beginWebOAuth, supportsWebOAuth, webOAuthCookieValue } from "../../../../../lib/account/webOAuth";

type RouteProps = { params: Promise<{ connectorId: string }> };

/**
 * POST /api/dashboard/integrations/<connector> — start connecting a connector.
 *
 * Checked here, independently of anything the page showed: a session, that PawOS supports the
 * connector, and that the account's server-resolved tier holds the connector's FeatureId (Team and
 * Enterprise tiers come only from an active organization membership). A locked connector is
 * rejected with 403 no matter how the request was made.
 *
 * What happens next depends on the connector:
 *  - Bitbucket Cloud can be connected from the web: the response carries the provider consent URL
 *    and sets an httpOnly state cookie; the flow finishes at
 *    /api/connectors/bitbucket/oauth/callback, which stores the tokens in the shared vault.
 *  - Every other connector's consent still runs in the PawOS desktop app (its SDK needs account
 *    details only that flow collects); this endpoint authorises the attempt and says where to
 *    finish it. The connection then appears here because both apps read the same record.
 */
export async function POST(request: Request, props: RouteProps) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { connectorId } = await props.params;

  const integration = getIntegration(connectorId);
  if (!integration) {
    return NextResponse.json({ ok: false, code: "unknown_connector", message: "PawOS doesn't support that integration." }, { status: 404 });
  }
  if (!isIntegrationEntitled(guard.account, integration.id)) {
    return NextResponse.json({ ok: false, code: "not_entitled", message: `${integration.name} is available on a higher plan.` }, { status: 403 });
  }
  if (supportsWebOAuth(integration.id)) {
    const started = beginWebOAuth(integration.id);
    if (!started) {
      return NextResponse.json(
        { ok: false, code: "not_configured", message: `${integration.name} isn't set up on PawOS yet. Please try again later.` },
        { status: 503 }
      );
    }
    const response = NextResponse.json({ ok: true, connect: { method: "redirect", url: started.url } });
    response.cookies.set(WEB_OAUTH_STATE_COOKIE, webOAuthCookieValue(integration.id, started.state), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // the provider's redirect back is a top-level navigation
      path: WEB_OAUTH_STATE_COOKIE_PATH,
      maxAge: WEB_OAUTH_STATE_MAX_AGE_SECONDS,
    });
    return response;
  }

  return NextResponse.json({
    ok: true,
    connect: {
      method: "desktop",
      message: `Open PawOS on your desktop, go to Settings → Connections and connect ${integration.name}. It will show as connected here once it's done.`,
    },
  });
}

/**
 * DELETE /api/dashboard/integrations/<connector> — disconnect. Removes the account's own stored
 * credential and connection record (row-level security scopes both deletes to the session's user).
 * Needs a session and a supported connector, but no entitlement: an account can always revoke.
 */
export async function DELETE(request: Request, props: RouteProps) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { connectorId } = await props.params;

  const integration = getIntegration(connectorId);
  if (!integration) {
    return NextResponse.json({ ok: false, code: "unknown_connector", message: "PawOS doesn't support that integration." }, { status: 404 });
  }
  try {
    await disconnectIntegration(guard.account, integration.id);
    const integrations = await listIntegrations(guard.account);
    return NextResponse.json({ ok: true, integration: integrations.find((i) => i.id === integration.id) });
  } catch {
    return NextResponse.json({ ok: false, code: "failed", message: `Could not disconnect ${integration.name}. Please try again.` }, { status: 500 });
  }
}
