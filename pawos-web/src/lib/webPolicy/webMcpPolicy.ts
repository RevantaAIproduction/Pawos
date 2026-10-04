import type { AccountContext } from "../account/accountContext";
import { isIntegrationEntitled } from "../account/integrations";
import { webCapabilityStatus } from "./webCapabilities";

/**
 * The security gate any PawOS Web use of a connected service's MCP server must pass. MCP calls run
 * on the server — never from the browser, and never with a credential the browser can see.
 *
 * Today PawOS Web makes NO MCP calls: `web.mcpRead` is "desktopOnly", so this gate refuses every
 * operation and the Integrations page says MCP runs in the desktop app. The gate exists so that a
 * future server-side MCP client has exactly one place to be authorized, in this order:
 *   1. the account may use MCP on the web at all (`web.mcpRead`, from the server-resolved tier);
 *   2. the operation only reads — writes are never allowed from the web by this policy;
 *   3. the provider is allowlisted for the web;
 *   4. the account's plan includes the provider's connector (the same FeatureId the desktop checks);
 *   5. the tool is on the provider's read allowlist.
 * The caller is still responsible for the account's own connection and credential lookup, which
 * stays server-side (connectivity_credentials).
 */

export type WebMcpAccess = "read" | "write";

export interface WebMcpOperation {
  provider: string;
  tool: string;
  access: WebMcpAccess;
}

export type WebMcpRefusal = "desktop_only" | "not_available" | "write_not_allowed" | "provider_not_allowed" | "not_entitled" | "tool_not_allowed";

/**
 * Read-only tools PawOS Web may call per provider. Empty until a server-side MCP client exists —
 * an entry here is a deliberate, reviewed decision, never a default.
 */
export const WEB_MCP_READ_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {};

export function authorizeWebMcpOperation(account: Pick<AccountContext, "tier">, operation: WebMcpOperation): { ok: true } | { ok: false; reason: WebMcpRefusal } {
  const status = webCapabilityStatus(account, "web.mcpRead");
  if (status === "desktopOnly") return { ok: false, reason: "desktop_only" };
  if (status !== "available") return { ok: false, reason: status === "locked" ? "not_entitled" : "not_available" };
  if (operation.access !== "read") return { ok: false, reason: "write_not_allowed" };
  const tools = WEB_MCP_READ_ALLOWLIST[operation.provider];
  if (!tools) return { ok: false, reason: "provider_not_allowed" };
  if (!isIntegrationEntitled(account, operation.provider)) return { ok: false, reason: "not_entitled" };
  if (!tools.includes(operation.tool)) return { ok: false, reason: "tool_not_allowed" };
  return { ok: true };
}
