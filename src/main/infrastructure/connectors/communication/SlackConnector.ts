export type SlackIdentity = { teamName: string; teamId: string; userId: string; botUserId?: string };

/** Real Slack Web API connector — bot-token scoped (chat:write, channels:read), the "Add to
 *  Slack" OAuth v2 installation flow's standard shape. Minimal on purpose: only the capabilities
 *  SlackConnectorSDK actually declares. */
export class SlackConnector {
  readonly id = 'slack' as const;
  readonly displayName = 'Slack';

  constructor(private accessToken: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json; charset=utf-8' };
  }

  async whoAmI(): Promise<{ ok: true; identity: SlackIdentity } | { ok: false; reason: string }> {
    if (!this.accessToken) return { ok: false, reason: 'Slack is not connected.' };
    try {
      const res = await fetch('https://slack.com/api/auth.test', { headers: this.headers() });
      const json = (await res.json()) as { ok: boolean; error?: string; team?: string; team_id?: string; user_id?: string; bot_id?: string };
      if (!json.ok) return { ok: false, reason: json.error ?? 'Slack rejected the stored access token.' };
      return { ok: true, identity: { teamName: json.team ?? 'Slack workspace', teamId: json.team_id ?? '', userId: json.user_id ?? '', botUserId: json.bot_id } };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Slack: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async listChannels(): Promise<{ ok: true; channels: { id: string; name: string }[] } | { ok: false; reason: string }> {
    if (!this.accessToken) return { ok: false, reason: 'Slack is not connected.' };
    try {
      const res = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200', { headers: this.headers() });
      const json = (await res.json()) as { ok: boolean; error?: string; channels?: { id: string; name: string }[] };
      if (!json.ok) return { ok: false, reason: json.error ?? 'Failed to list Slack channels.' };
      return { ok: true, channels: json.channels ?? [] };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Slack: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async postMessage(channel: string, text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!this.accessToken) return { ok: false, reason: 'Slack is not connected.' };
    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ channel, text }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) return { ok: false, reason: json.error ?? 'Failed to post message to Slack.' };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Slack: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
