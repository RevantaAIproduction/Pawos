import { handleConnectorCallback } from "../../../../../../lib/account/webOAuthCallback";

/**
 * GET /api/connectors/bitbucket/oauth/callback — the redirect URL registered on PawOS's Bitbucket
 * Cloud OAuth consumer (https://pawos.revantaai.com/api/connectors/bitbucket/oauth/callback).
 * Bitbucket sends the browser here with `code` + `state`, or `error` + `error_description`.
 *
 * Two kinds of flow arrive at this one URL (see handleConnectorCallback):
 *  - Started in the PawOS desktop app (any state not beginning "web."): relayed to the desktop's
 *    local listener, where OAuthManager exchanges the code through /api/connectivity/oauth/exchange
 *    and stores the tokens in the Credential Vault — identical to every other connector callback.
 *  - Started on PawOS Web (state "web.…"): completed here — state cookie, session and entitlement
 *    checked, code exchanged at https://bitbucket.org/site/oauth2/access_token, tokens stored in the
 *    same vault-backed credential store the desktop uses, browser sent back to Integrations.
 *    Tokens never appear in a URL, a cookie or a response body.
 */
export async function GET(request: Request) {
  return handleConnectorCallback(request, "bitbucket");
}
