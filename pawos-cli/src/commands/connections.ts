import type { CliContext } from "../context";
import { PawosApiError, integrationsUrl, type Integration } from "../shared";
import { renderConnections, renderRefusal } from "../ui/account";
import { blank, clean, cleanUrl, line, seg } from "../ui/terminal";

/**
 * The account's connected services. They belong to the PawOS account, not to a folder: this works
 * the same from any directory, inside a Git repository or not.
 *
 * PawOS's own OAuth is used as it is. The CLI holds no client id, no secret and no token, and runs
 * no OAuth flow of its own: it asks PawOS whether the account may connect a service and where, the
 * user finishes on PawOS (its Integrations page, or the desktop app), and the CLI then asks PawOS
 * whether the connection is there. What the service authorises never passes through the terminal.
 */
function baseUrl(ctx: CliContext): string {
  return ctx.config.ok ? ctx.config.config.apiBaseUrl : "";
}

/** Finds a connector by what the user typed: its id or its name, in any case. */
export function findIntegration(integrations: Integration[], wanted: string): Integration | null {
  const text = wanted.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  return integrations.find((integration) => integration.id.toLowerCase() === text || integration.name.toLowerCase() === text) ?? integrations.find((integration) => integration.name.toLowerCase().startsWith(text)) ?? null;
}

/** `/connections` — every connector PawOS supports, with this account's state. */
export async function showConnections(ctx: CliContext): Promise<void> {
  const { term } = ctx;
  try {
    const integrations = await ctx.client.listIntegrations();
    const page = cleanUrl(integrationsUrl(baseUrl(ctx)));
    term.print([blank(), line("  ", seg("Connections", "strong")), blank(), ...renderConnections(integrations, term.glyphs), blank(), line("  ", seg("/connect <name> to connect one.", "muted")), ...(page ? [line("  ", seg("Manage them in PawOS:", "muted")), line(seg(page, "accent", page))] : []), blank()]);
  } catch (error) {
    term.print([blank(), ...renderRefusal(error, null, baseUrl(ctx)), blank()]);
  }
}

/**
 * `/connect <name>` — says where PawOS connects a service, then asks PawOS whether it is connected
 * and comes straight back to the prompt. Resolves true only when PawOS reports the service connected.
 */
export async function connectService(ctx: CliContext, wanted: string, planLabel: string | null = null): Promise<boolean> {
  const { term } = ctx;
  const say = (text: string, tone?: Parameters<typeof seg>[1]) => term.print([line("  ", seg(text, tone))]);
  let integrations: Integration[];
  try {
    integrations = await ctx.client.listIntegrations();
  } catch (error) {
    term.print([blank(), ...renderRefusal(error, planLabel, baseUrl(ctx)), blank()]);
    return false;
  }
  const integration = findIntegration(integrations, wanted);
  if (!integration) {
    term.print([blank(), line("  ", wanted.trim() ? "PawOS doesn't have a connection by that name." : "Which one? For example: /connect github"), line("  ", seg(`Available: ${integrations.map((item) => clean(item.id, 30)).join(", ") || "none"}`, "muted")), blank()]);
    return false;
  }
  const name = clean(integration.name, 40);
  term.print([blank()]);
  if (integration.connection === "connected") {
    term.print([line("  ", seg(term.glyphs.done, "good"), ` ${name} is already connected`, ...(integration.accountLabel ? [seg(`  ${clean(integration.accountLabel, 60)}`, "muted")] : [])), blank()]);
    return true;
  }

  // PawOS decides whether this account may connect it (the plan), and where it is done.
  let where;
  try {
    where = await ctx.client.startConnect(integration.id);
  } catch (error) {
    if (error instanceof PawosApiError && error.code === "not_entitled") {
      term.print([line("  ", seg(`${name} isn't available for this PawOS account.`, "warn")), ...renderRefusal(new PawosApiError("forbidden", error.message, error.status, "capability_locked"), planLabel, baseUrl(ctx)).slice(2), blank()]);
    } else {
      term.print([...renderRefusal(error, planLabel, baseUrl(ctx)), blank()]);
    }
    return false;
  }

  // The connection is made on PawOS, never here: the CLI only says where, then asks PawOS whether it is there.
  term.print([line("  ", integration.connection === "needsReauth" || integration.connection === "error" ? `${name} needs to be reconnected.` : `${name} is not connected.`), blank()]);
  if (where.method === "desktop") {
    for (const text of (clean(where.message, 400) || `Connect ${name} from the PawOS desktop app (Settings, Connections).`).split(/(?<=\.)\s+/)) say(text);
  } else {
    const page = cleanUrl(integrationsUrl(baseUrl(ctx)));
    say(`Open PawOS Integrations to connect ${name}.`);
    if (page) term.print([blank(), line(seg(page, "accent", page))]);
  }
  term.print([blank()]);

  const answer = await ctx.prompter.ask("  After completing the connection, press Enter to check again (or type skip): ");
  if (answer === null || /^(s|skip|n|no|cancel)$/i.test(answer.trim())) {
    term.print([line("  ", seg(`${name} was not connected.`, "muted")), blank()]);
    return false;
  }
  try {
    const now = (await ctx.client.listIntegrations()).find((item) => item.id === integration.id);
    if (now?.connection === "connected") {
      term.print([line("  ", seg(term.glyphs.done, "good"), ` ${name} connected`, ...(now.accountLabel ? [seg(`  ${clean(now.accountLabel, 60)}`, "muted")] : [])), blank()]);
      return true;
    }
    term.print([line("  ", seg(`${name} isn't connected yet.`, "warn")), line("  ", seg(`Complete the connection in PawOS, then use /connect ${integration.id} to check again.`, "muted")), blank()]);
  } catch (error) {
    term.print([...renderRefusal(error, planLabel, baseUrl(ctx)), blank()]);
  }
  return false;
}
