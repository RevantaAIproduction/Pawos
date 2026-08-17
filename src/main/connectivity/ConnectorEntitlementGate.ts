import { entitlementService } from '../billing/EntitlementService';
import { CONNECTOR_REQUIRED_FEATURE } from '../../shared/connectivity/ConnectivityTypes';

/**
 * The trusted, server-side predicate behind connectivityIpc.ts's connector entitlement gate —
 * extracted into its own module (rather than inlined in connectivityIpc.ts) so it's unit-testable
 * without importing 'electron', mirroring ThinkExecuteGate.ts's identical rationale for the
 * Think-vs-Execute wall. Reads the exact same CONNECTOR_REQUIRED_FEATURE map ConnectionsPage.tsx's
 * UI already reads to disable a Connect button — this is not a second, parallel gating table, it's
 * the same one now also enforced where it actually matters: before any OAuth flow starts or any
 * credential is created. A connector with no CONNECTOR_REQUIRED_FEATURE entry is honestly treated as
 * unrestricted (nothing in today's catalog is unconditionally free, but this never defaults to
 * "blocked" for a connector the map simply hasn't been told about).
 */
export function isConnectorEntitled(connectorId: string): boolean {
  const requiredFeature = CONNECTOR_REQUIRED_FEATURE[connectorId];
  if (!requiredFeature) return true;
  return entitlementService.isFeatureAvailable(requiredFeature);
}
