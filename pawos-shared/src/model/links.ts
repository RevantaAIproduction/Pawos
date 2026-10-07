/**
 * The existing PawOS Web pages a client points the user at. A client never takes a payment or runs
 * an OAuth flow of its own: plans, billing and connecting a service all happen on PawOS itself.
 */
const page = (apiBaseUrl: string, path: string) => `${apiBaseUrl.replace(/\/+$/, "")}${path}`;

/** Plans and upgrading — the same page PawOS Web links to when a limit or plan stops a request. */
export const plansUrl = (apiBaseUrl: string) => page(apiBaseUrl, "/pricing");
/** The account's usage and spending. */
export const usageUrl = (apiBaseUrl: string) => page(apiBaseUrl, "/dashboard/spending");
/** Connecting and disconnecting services. */
export const integrationsUrl = (apiBaseUrl: string) => page(apiBaseUrl, "/dashboard/integrations");
