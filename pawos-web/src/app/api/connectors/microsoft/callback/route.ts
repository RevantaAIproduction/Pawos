/**
 * Microsoft connector OAuth callback.
 * Relays the authorization code to the desktop app via the standard
 * connectorId-based callback URL pattern (see relayConnectivityToDesktop).
 */

import { relayConnectivityToDesktop } from '../../../../../lib/desktopRelay';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get('error_description') ?? searchParams.get('error');
  return relayConnectivityToDesktop(searchParams.get('code'), error, searchParams.get('state'));
}
