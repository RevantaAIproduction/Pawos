import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveAccountContext, type AccountContext } from "../accountContext";

/**
 * Test-only stand-in for the PawOS database, used by the account/dashboard tests. It models the
 * tables and database functions those tests touch — including the account-profile functions from
 * supabase/migrations/20261004000000_account_profile_companion.sql, re-implemented here in
 * TypeScript with the same rules. It is a model of that SQL, not the SQL itself.
 *
 * The Web chat functions model 20261004020000_web_tier_architecture.sql: request claims, the
 * monotonic per-account counter and the writer guards (the real SQL is exercised against
 * PostgreSQL by supabase/tests/web_tier/run_local.sh).
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

const GUARDED_TABLES = ["web_chat_messages", "web_chat_usage", "web_chat_requests"];
const SERVICE_ONLY_TABLES = ["web_chats", "web_chat_attachments", "web_repository_selection", "web_code_changes"];

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
    web_chat_usage: [],
    web_chat_requests: [],
    web_chat_attachments: [],
    web_repository_selection: [],
    web_code_changes: [],
  };
  /** Objects in Supabase Storage, keyed "bucket/path". Service role only, like the private bucket. */
  storage = new Map<string, { data: Uint8Array; contentType: string }>();
  /**
   * When set, a model of one account allowance shared by every surface: each reserve_usage takes
   * one unit whatever its category (Web or Desktop), a release gives it back, and an empty pool
   * refuses with plan_exhausted.
   */
  usagePool: number | null = null;
  /** Numbers the pool model's reservations. */
  private reservationSeq = 0;
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

    if (name === "web_code_change_claim_fix") {
      if (!serviceRole) return fail("permission denied for function " + name);
      const row = this.tables.web_code_changes.find((r) => r.id === args.p_change_id && r.user_id === args.p_user_id);
      const leaseFree = !row?.fix_lease_until || Date.parse(String(row.fix_lease_until)) < Date.now();
      if (!row || !["pushed", "fixing"].includes(String(row.state)) || Number(row.fix_attempts) >= Number(args.p_max_attempts) || !leaseFree) return ok(false);
      Object.assign(row, { fix_attempts: Number(row.fix_attempts) + 1, fix_lease_until: new Date(Date.now() + 180_000).toISOString(), state: "fixing" });
      return ok(true);
    }

    if (name === "web_chat_begin_request" || name === "web_chat_fail_request" || name === "web_chat_append_exchange") {
      if (!serviceRole) return fail("permission denied for function " + name);
      return this.webChatFunction(name, args);
    }

    if (!userId) return fail("not_authenticated");
    const state = this.users.get(userId) ?? {};
    if (name === "reserve_usage" || name === "settle_usage" || name === "release_usage_reservation") {
      this.usageCalls.push({ name, args });
      if (this.usagePool === null) return ok(name === "reserve_usage" ? this.reserveResult : { ok: true });
      if (name === "reserve_usage") {
        if (this.usagePool <= 0) return ok({ ok: false, reason: "plan_exhausted" });
        this.usagePool -= 1;
        this.reservationSeq += 1;
        return ok({ ok: true, reservationId: `pool-res-${this.reservationSeq}`, maxOutputTokens: 1024 });
      }
      if (name === "release_usage_reservation") this.usagePool += 1;
      return ok({ ok: true });
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
      case "read_connectivity_credential": {
        // Reads under the caller's own id only (auth.uid()), like the real function.
        const row = this.tables.connectivity_credentials.find((r) => r.user_id === userId && r.connector_id === args.p_connector_id && (r.organization_id ?? null) === (args.p_organization_id ?? null));
        return ok(row ? [{ auth_method: row.auth_method, secret: row.secret ?? null, refresh_token: row.refresh_token ?? null, expires_at: row.expires_at ?? null }] : []);
      }
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

  private webMessagesUsed(uid: string, windowDays: number | null = null): number {
    if (windowDays !== null) {
      const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
      return this.tables.web_chat_requests.filter((r) => r.user_id === uid && r.state === "completed" && Date.parse(String(r.updated_at ?? 0)) > since).length;
    }
    const counter = Number(this.tables.web_chat_usage.find((row) => row.user_id === uid)?.messages_sent ?? 0);
    // Web messages only (surface 'web'); Desktop turns synced to the account don't count.
    return Math.max(counter, this.tables.web_chat_messages.filter((m) => m.user_id === uid && m.role === "user" && (m.surface ?? "web") === "web").length);
  }

  /** The Web chat storing functions — a model of their SQL, including the per-account serialization. */
  private webChatFunction(name: string, args: Row): { data: unknown; error: { message: string } | null } {
    const fail = (message: string) => ({ data: null, error: { message } });
    const ok = (data: unknown) => ({ data, error: null });
    const uid = String(args.p_user_id);
    const requestId = (args.p_request_id as string | null | undefined) ?? null;
    const limit = (args.p_message_limit as number | null | undefined) ?? null;
    const windowDays = (args.p_limit_window_days as number | null | undefined) ?? null;
    const request = requestId ? this.tables.web_chat_requests.find((r) => r.user_id === uid && r.request_id === requestId) : undefined;

    if (name === "web_chat_fail_request") {
      if (request && request.state === "processing") Object.assign(request, { state: "failed", error_code: args.p_error_code });
      return ok(null);
    }

    if (name === "web_chat_begin_request") {
      if (!requestId || !/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return fail("invalid_request_id");
      if (request?.state === "completed") {
        const reply = this.tables.web_chat_messages.find((m) => m.user_id === uid && m.role === "assistant" && m.request_id === requestId);
        return ok({ status: "completed", chatId: request.chat_id, reply: reply?.content ?? null });
      }
      if (request?.state === "processing" && Date.parse(String(request.lease_expires_at)) > Date.now()) return ok({ status: "processing", chatId: request.chat_id });
      const chatId = (args.p_chat_id as string | null) ?? null;
      if (chatId && !this.tables.web_chats.some((c) => c.id === chatId && c.user_id === uid)) return fail("chat_not_found");
      const used = this.webMessagesUsed(uid, windowDays);
      if (limit !== null) {
        const inflight = this.tables.web_chat_requests.filter((r) => r.user_id === uid && r.state === "processing" && Date.parse(String(r.lease_expires_at)) > Date.now() && r.request_id !== requestId).length;
        if (used + inflight >= limit) return fail("message_limit_reached");
      }
      const lease = new Date(Date.now() + Number(args.p_lease_seconds ?? 150) * 1000).toISOString();
      if (request) Object.assign(request, { state: "processing", chat_id: chatId, error_code: null, lease_expires_at: lease });
      else this.tables.web_chat_requests.push({ user_id: uid, request_id: requestId, chat_id: chatId, state: "processing", lease_expires_at: lease });
      return ok({ status: "claimed", messagesUsed: used });
    }

    // web_chat_append_exchange
    const used = this.webMessagesUsed(uid, windowDays);
    const lifetime = this.webMessagesUsed(uid);
    if (requestId !== null) {
      const existing = this.tables.web_chat_messages.find((m) => m.user_id === uid && m.role === "user" && m.request_id === requestId);
      if (existing) {
        const reply = this.tables.web_chat_messages.find((m) => m.chat_id === existing.chat_id && m.role === "assistant" && m.request_id === requestId);
        return ok({ chatId: existing.chat_id, messagesUsed: used, reply: reply?.content ?? null, duplicate: true });
      }
    }
    if (limit !== null && used >= limit) return fail("message_limit_reached");
    let chatId = args.p_chat_id as string | null;
    if (!chatId) {
      chatId = `00000000-0000-4000-8000-${String(this.tables.web_chats.length + 1).padStart(12, "0")}`;
      this.tables.web_chats.push({ id: chatId, user_id: uid, title: String(args.p_user_content).slice(0, 60), surface: "web", updated_at: this.now() });
    } else if (!this.tables.web_chats.some((c) => c.id === chatId && c.user_id === uid)) {
      return fail("chat_not_found");
    }
    const attachmentId = (args.p_attachment_id as string | null | undefined) ?? null;
    const attachment = attachmentId ? this.tables.web_chat_attachments.find((a) => a.id === attachmentId && a.user_id === uid && !a.message_id) : undefined;
    if (attachmentId && !attachment) return fail("attachment_not_found");
    const ids: string[] = [];
    for (const [role, content] of [["user", args.p_user_content], ["assistant", args.p_assistant_content]] as const) {
      const id = `m-${this.tables.web_chat_messages.length + 1}`;
      ids.push(id);
      this.tables.web_chat_messages.push({
        id,
        chat_id: chatId,
        user_id: uid,
        role,
        content,
        request_id: requestId,
        surface: "web",
        requires_desktop: role === "assistant" && args.p_requires_desktop === true,
        created_at: this.now(),
      });
    }
    if (attachment) Object.assign(attachment, { chat_id: chatId, message_id: ids[0] });
    const counter = this.tables.web_chat_usage.find((row) => row.user_id === uid);
    if (counter) counter.messages_sent = Math.max(Number(counter.messages_sent) + 1, lifetime + 1);
    else this.tables.web_chat_usage.push({ user_id: uid, messages_sent: lifetime + 1 });
    const completedAt = new Date().toISOString();
    if (requestId) {
      if (request) Object.assign(request, { state: "completed", chat_id: chatId, updated_at: completedAt });
      else this.tables.web_chat_requests.push({ user_id: uid, request_id: requestId, chat_id: chatId, state: "completed", lease_expires_at: completedAt, updated_at: completedAt });
    }
    return ok({ chatId, messagesUsed: used + 1, reply: args.p_assistant_content, duplicate: false });
  }

  /** A Supabase-client-shaped object acting as `userId` (row-level security: own rows only). */
  client(userId: string | null, serviceRole = false): SupabaseClient {
    const query = (table: string, mode: "select" | "delete") => {
      const filters: Array<(row: Row) => boolean> = [];
      let ordering: { column: string; ascending: boolean } | null = null;
      // RLS: every table modelled here is owner-scoped.
      if (!serviceRole) filters.push((row) => userId !== null && row.user_id === userId);
      const run = () => {
        const rows = this.tables[table] ?? [];
        const matched = rows.filter((row) => filters.every((f) => f(row)));
        // Writer guard: the counter goes only with its account.
        if (mode === "delete" && (table === "web_chat_usage" || table === "web_chat_requests") && matched.length > 0) return { data: null, error: { message: "web_chat_direct_write_forbidden" }, count: 0 };
        if (ordering) {
          const { column, ascending } = ordering;
          matched.sort((a, b) => (String(a[column] ?? "") < String(b[column] ?? "") ? -1 : String(a[column] ?? "") > String(b[column] ?? "") ? 1 : 0) * (ascending ? 1 : -1));
        }
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
        gte(column: string, value: unknown) {
          filters.push((row) => String(row[column] ?? "") >= String(value));
          return chain;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          ordering = { column, ascending: options?.ascending !== false };
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[] | null; error: { message: string } | null; count: number }) => unknown) => Promise.resolve(run()).then(resolve),
      };
      return chain;
    };
    const bucket = (id: string) => ({
      upload: async (path: string, data: Uint8Array, options: { contentType?: string } = {}) => {
        if (!serviceRole) return { data: null, error: { message: "row-level security" } };
        if (this.storage.has(`${id}/${path}`)) return { data: null, error: { message: "The resource already exists" } };
        this.storage.set(`${id}/${path}`, { data, contentType: options.contentType ?? "application/octet-stream" });
        return { data: { path }, error: null };
      },
      download: async (path: string) => {
        const object = serviceRole ? this.storage.get(`${id}/${path}`) : undefined;
        return object ? { data: new Blob([new Uint8Array(object.data)], { type: object.contentType }), error: null } : { data: null, error: { message: "Object not found" } };
      },
      remove: async (paths: string[]) => {
        if (serviceRole) for (const path of paths) this.storage.delete(`${id}/${path}`);
        return { data: null, error: null };
      },
    });
    return {
      storage: { from: bucket },
      rpc: async (name: string, args?: Row) => this.rpc(userId, name, args, serviceRole),
      from: (table: string) => ({
        select: () => query(table, "select"),
        delete: () => query(table, "delete"),
        insert: async (row: Row) => {
          // Writer guard (web_tier_architecture.sql): only the storing functions write these, not even the service role directly.
          if (GUARDED_TABLES.includes(table)) return { data: null, error: { message: "web_chat_direct_write_forbidden" } };
          // Server-written tables: no insert policy for signed-in users.
          if (!serviceRole && SERVICE_ONLY_TABLES.includes(table)) return { data: null, error: { message: "row-level security" } };
          if (!serviceRole && row.user_id !== userId) return { data: null, error: { message: "row-level security" } };
          (this.tables[table] ??= []).push({ id: `${table}-${(this.tables[table] ?? []).length + 1}`, created_at: this.now(), ...row });
          return { data: null, error: null };
        },
        upsert: async (row: Row) => {
          if (!serviceRole && SERVICE_ONLY_TABLES.includes(table)) return { data: null, error: { message: "row-level security" } };
          const rows = (this.tables[table] ??= []);
          const existing = rows.findIndex((candidate) => candidate.user_id === row.user_id);
          if (existing >= 0) rows[existing] = { ...rows[existing], ...row };
          else rows.push(row);
          return { data: null, error: null };
        },
        update: (patch: Row) => ({
          eq: async (column: string, value: unknown) => {
            if (GUARDED_TABLES.includes(table)) return { data: null, error: { message: "web_chat_direct_write_forbidden" } };
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
