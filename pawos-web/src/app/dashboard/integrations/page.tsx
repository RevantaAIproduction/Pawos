import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import { getIntegration, listIntegrations, type IntegrationState } from "../../../lib/account/integrations";
import { PageHeader } from "../../../components/dashboard/ui";
import { IntegrationsList } from "./IntegrationsList";

export const metadata: Metadata = { title: "Integrations" };

/** Outcome codes the connector OAuth callback redirects back with — fixed codes, never provider text. */
const CALLBACK_MESSAGES: Record<string, { tone: "ok" | "error"; text: (name: string) => string }> = {
  connected: { tone: "ok", text: (name) => `${name} is connected. It's available in the PawOS desktop app the next time it starts.` },
  denied: { tone: "error", text: (name) => `${name} wasn't connected because access was declined.` },
  expired: { tone: "error", text: (name) => `That ${name} sign-in expired or didn't start here. Choose Connect to try again.` },
  not_entitled: { tone: "error", text: (name) => `${name} isn't included in your plan.` },
  not_configured: { tone: "error", text: (name) => `${name} isn't set up on PawOS yet. Please try again later.` },
  failed: { tone: "error", text: (name) => `${name} couldn't be connected. Please try again.` },
};

export default async function DashboardIntegrationsPage({ searchParams }: { searchParams: Promise<{ integration?: string; status?: string }> }) {
  const { integration: callbackIntegration, status: callbackStatus } = await searchParams;
  const callbackTarget = callbackIntegration ? getIntegration(callbackIntegration) : undefined;
  const callbackMessage = callbackTarget && callbackStatus ? CALLBACK_MESSAGES[callbackStatus] : undefined;

  const account = await getAccountContext();
  if (!account) redirect("/login");

  let integrations: IntegrationState[] | null = null;
  try {
    integrations = await listIntegrations(account);
  } catch {
    integrations = null;
  }

  return (
    <>
      <PageHeader
        title="Integrations"
        description={`Connections are shared between PawOS on the web and the desktop app. Your plan: ${account.tierLabel}.`}
      />
      {callbackTarget && callbackMessage && (
        <p
          role={callbackMessage.tone === "error" ? "alert" : "status"}
          className={`mb-6 rounded-xl border p-4 text-sm ${
            callbackMessage.tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {callbackMessage.text(callbackTarget.name)}
        </p>
      )}
      {integrations ? (
        <IntegrationsList initial={integrations} />
      ) : (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 text-sm text-neutral-400">
          Connection state isn&apos;t available right now. Try again in a moment.
        </p>
      )}
    </>
  );
}
