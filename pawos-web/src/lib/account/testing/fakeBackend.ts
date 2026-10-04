import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveAccountContext, type AccountContext } from "../accountContext";

/**
 * Test-only stand-in for the PawOS database, used by the account/dashboard tests. It models the
 * tables and database functions those tests touch — including the account-profile functions from
 * supabase/migrations/20261004000000_account_profile_companion.sql, re-implemented here in
 * TypeScript with the same rules. It is a model of that SQL, not the SQL itself.
 */

type Row = Record<string, unknown>;

export interface FakeUserState {
  subscription?: { active: boolean; tier: "pro" | "proMax"; proMaxVariant?: string | null; expiresAt?: string | null };
  buildStatus?: "none" | "active" | "expired" | "revoked";
  meta?: Record<string, unknown>;
  email?: string;
}

interface ProfileRow {
  user_id: string;
  handle: string;
  public_profile_enabled: boolean;
  display_name: string | null;
  bio: string | null;
  public_links: { label: string; url: string }[];
  companion_id: string | null;
  custom_companion_name: string | null;
  companion_updated_at: string;
}

const HANDLE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
const RESERVED = ["admin", "api", "pawos", "paw", "support", "help", "settings", "dashboard", "login", "signup", "revanta", "revantaai"];

export class FakeBackend {
  users = new Map<string, FakeUserState>();
  tables: Record<string, Row[]> = {
    organization_members: [],
    connectivity_connections: [],
    connectivity_credentials: [],
    web_chats: [],
    web_chat_messages: [],
  };
  /** What reserve_usage answers; tests set this to model an exhausted allowance. */
  reserveResult: Row = { ok: true, reservationId: "res-1", maxOutputTokens: 1024 };
  usageCalls: Array<{ name: string; args: Row }> = [];
  catalog = new Map<string, string | null>([["paw-default", null]]);
  profiles = new Map<string, ProfileRow>();
  usageSummary: unknown = { plan: null, buckets: [], weeklyPacing: null, limitReached: false, limitResetsAt: null };
  /** What get_my_usage_history answers, per user. */
  usageHistory = new Map<string, Row[]>();
  private clock = 0;

  addUser(id: string, state: FakeUserState = {}): User {
    this.users.set(id, state);
    return { id, email: state.email ?? `${id}@example.com`, user_metadata: state.meta ?? {}, created_at: "2026-01-01T00:00:00Z" } as unknown as User;
  }

  private now(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 9, 4, 0, 0, this.clock)).toISOString();
  }

  private ensureProfile(userId: string): ProfileRow {
    let row = this.profiles.get(userId);
    if (!row) {
      row = {
        user_id: userId,
        handle: `paw-${userId.replace(/[^a-z0-9]/g, "").padEnd(10, "0").slice(0, 10)}`,
        public_profile_enabled: false,
        display_name: null,
        bio: null,
        public_links: [],
        companion_id: "paw-default",
        custom_companion_name: null,
        companion_updated_at: this.now(),
      };
      this.profiles.set(userId, row);
    }
    return row;
  }

  private profileJson(row: ProfileRow) {
    return {
      handle: row.handle,
      publicProfileEnabled: row.public_profile_enabled,
      displayName: row.display_name,
      bio: row.bio,
      links: row.public_links,
      companionId: row.companion_id,
      customCompanionName: row.custom_companion_name,
      companionUpdatedAt: row.companion_updated_at,
    };
  }

  /** `userId` null = anonymous caller; `serviceRole` = the backend's service-role client. */
  rpc(userId: string | null, name: string, args: Row = {}, serviceRole = false): { data: unknown; error: { message: string } | null } {
    const fail = (message: string) => ({ data: null, error: { message } });
    const ok = (data: unknown) => ({ data, error: null });

    if (name === "get_public_profile") {
      const handle = String(args.p_handle ?? "").trim().toLowerCase();
      const row = [...this.profiles.values()].find((p) => p.handle === handle && p.public_profile_enabled);
      if (!row) return ok(null);
      const meta = this.users.get(row.user_id)?.meta ?? {};
      return ok({
        handle: row.handle,
        displayName: row.display_name ?? (meta.full_name as string) ?? (meta.name as string) ?? row.handle,
        avatarUrl: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
        bio: row.bio,
        links: row.public_links,
        companionId: row.companion_id,
        customCompanionName: row.custom_companion_name,
      });
    }

    if (name === "set_user_companion_service") {
      if (!serviceRole) return fail("unauthorized: backend-only operation");
      const companionId = String(args.p_companion_id);
      if (!this.catalog.has(companionId)) return fail("unknown_companion");
      const row = this.ensureProfile(String(args.p_user_id));
      Object.assign(row, { companion_id: companionId, custom_companion_name: null, companion_updated_at: this.now() });
      return ok(this.profileJson(row));
    }

    if (name === "web_chat_append_exchange") {
      if (!serviceRole) return fail("unauthorized: backend-only operation");
      const uid = String(args.p_user_id);
      const used = this.tables.web_chat_messages.filter((m) => m.user_id === uid && m.role === "user").length;
      const requestId = (args.p_request_id as string | null | undefined) ?? null;
      if (requestId !== null) {
        const existing = this.tables.web_chat_messages.find((m) => m.user_id === uid && m.role === "user" && m.request_id === requestId);
        if (existing) {
          const reply = this.tables.web_chat_messages.find((m) => m.chat_id === existing.chat_id && m.role === "assistant" && m.request_id === requestId);
          return ok({ chatId: existing.chat_id, messagesUsed: used, reply: reply?.content ?? null, duplicate: true });
        }
      }
      const limit = args.p_message_limit as number | null;
      if (limit !== null && limit !== undefined && used >= limit) return fail("message_limit_reached");
      let chatId = args.p_chat_id as string | null;
      if (!chatId) {
        chatId = `00000000-0000-4000-8000-${String(this.tables.web_chats.length + 1).padStart(12, "0")}`;
        this.tables.web_chats.push({ id: chatId, user_id: uid, title: String(args.p_user_content).slice(0, 60), updated_at: this.now() });
      } else if (!this.tables.web_chats.some((c) => c.id === chatId && c.user_id === uid)) {
        return fail("chat_not_found");
      }
      for (const [role, content] of [["user", args.p_user_content], ["assistant", args.p_assistant_content]] as const) {
        this.tables.web_chat_messages.push({ id: `m-${this.tables.web_chat_messages.length + 1}`, chat_id: chatId, user_id: uid, role, content, request_id: requestId, created_at: this.now() });
      }
      return ok({ chatId, messagesUsed: used + 1, reply: args.p_assistant_content, duplicate: false });
    }

    if (!userId) return fail("not_authenticated");
    const state = this.users.get(userId) ?? {};
    if (name === "reserve_usage" || name === "settle_usage" || name === "release_usage_reservation") {
      this.usageCalls.push({ name, args });
      return ok(name === "reserve_usage" ? this.reserveResult : { ok: true });
    }

    switch (name) {
      case "get_my_subscription":
        return ok(state.subscription ?? { active: false });
      case "get_my_build_access":
        return ok({ status: state.buildStatus ?? "none" });
      case "get_my_usage_summary":
        return ok(this.usageSummary);
      case "get_my_usage_history":
        return ok(this.usageHistory.get(userId) ?? []);
      case "store_connectivity_credential": {
        const rows = this.tables.connectivity_credentials.filter((row) => !(row.user_id === userId && row.connector_id === args.p_connector_id));
        rows.push({ user_id: userId, organization_id: null, connector_id: args.p_connector_id, auth_method: args.p_auth_method, secret: args.p_secret, refresh_token: args.p_refresh_token, expires_at: args.p_expires_at });
        this.tables.connectivity_credentials = rows;
        return ok(null);
      }
      case "get_my_account_profile":
        return ok(this.profileJson(this.ensureProfile(userId)));
      case "set_my_companion": {
        const companionId = (args.p_companion_id as string | null) ?? null;
        const custom = typeof args.p_custom_name === "string" && args.p_custom_name.trim() ? args.p_custom_name.trim() : null;
        if ((companionId === null) === (custom === null)) return fail("invalid_companion");
        if (companionId !== null) {
          if (!this.catalog.has(companionId)) return fail("unknown_companion");
          if (this.catalog.get(companionId) !== null) return fail("companion_not_available");
        }
        const row = this.ensureProfile(userId);
        Object.assign(row, { companion_id: companionId, custom_companion_name: custom, companion_updated_at: this.now() });
        return ok(this.profileJson(row));
      }
      case "update_my_public_profile": {
        const handle = String(args.p_handle ?? "").trim().toLowerCase();
        if (!HANDLE.test(handle) || RESERVED.includes(handle)) return fail("invalid_handle");
        const links = (args.p_links ?? []) as { label: string; url: string }[];
        if (!Array.isArray(links) || links.length > 5 || links.some((l) => !l.label || !/^https:\/\//.test(l.url))) return fail("invalid_profile");
        if ([...this.profiles.values()].some((p) => p.handle === handle && p.user_id !== userId)) return fail("handle_taken");
        const row = this.ensureProfile(userId);
        Object.assign(row, {
          public_profile_enabled: args.p_enabled === true,
          handle,
          display_name: (args.p_display_name as string | null) || null,
          bio: (args.p_bio as string | null) || null,
          public_links: links,
        });
        return ok(this.profileJson(row));
      }
      default:
        return fail(`unknown function ${name}`);
    }
  }

  /** A Supabase-client-shaped object acting as `userId` (row-level security: own rows only). */
  client(userId: string | null, serviceRole = false): SupabaseClient {
    const query = (table: string, mode: "select" | "delete") => {
      const filters: Array<(row: Row) => boolean> = [];
      // RLS: every table modelled here is owner-scoped.
      if (!serviceRole) filters.push((row) => userId !== null && row.user_id === userId);
      const run = () => {
        const rows = this.tables[table] ?? [];
        const matched = rows.filter((row) => filters.every((f) => f(row)));
        if (mode === "delete") this.tables[table] = rows.filter((row) => !matched.includes(row));
        return { data: mode === "delete" ? null : matched, error: null, count: matched.length };
      };
      const chain = {
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return chain;
        },
        is(column: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) === value);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[] | null; error: null; count: number }) => unknown) => Promise.resolve(run()).then(resolve),
      };
      return chain;
    };
    return {
      rpc: async (name: string, args?: Row) => this.rpc(userId, name, args, serviceRole),
      from: (table: string) => ({
        select: () => query(table, "select"),
        delete: () => query(table, "delete"),
        insert: async (row: Row) => {
          if (!serviceRole && row.user_id !== userId) return { data: null, error: { message: "row-level security" } };
          (this.tables[table] ??= []).push({ id: `${table}-${(this.tables[table] ?? []).length + 1}`, created_at: "2026-10-04T00:00:00Z", ...row });
          return { data: null, error: null };
        },
        update: (patch: Row) => ({
          eq: async (column: string, value: unknown) => {
            for (const row of this.tables[table] ?? []) {
              if (row[column] === value && (serviceRole || row.user_id === userId)) Object.assign(row, patch);
            }
            return { data: null, error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
  }

  /** The AccountContext a request from `user` resolves to — through the real resolver. */
  accountFor(user: User): Promise<AccountContext> {
    return resolveAccountContext(this.client(user.id), user);
  }

  joinOrganization(userId: string, org: { id: string; name: string; tier: "team" | "enterprise" }, role: string, status = "active") {
    this.tables.organization_members.push({ user_id: userId, role, status, organizations: org });
  }

  addConnection(userId: string, connectorId: string, status = "connected", metadata: Row = {}) {
    this.tables.connectivity_connections.push({ user_id: userId, organization_id: null, connector_id: connectorId, status, metadata, created_at: "2026-09-01T00:00:00Z" });
    this.tables.connectivity_credentials.push({ user_id: userId, organization_id: null, connector_id: connectorId, auth_method: "oauth2" });
  }
}
