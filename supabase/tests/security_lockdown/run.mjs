// Security lockdown database tests — LOCAL THROWAWAY CLUSTER ONLY.
//
// Creates a brand-new PostgreSQL cluster in a temp folder, applies the Supabase stand-ins and the
// real migrations that define organizations, platform_admins and subscriptions, then plays a free
// account attacking the database directly (as the `authenticated` role, the way a request with the
// public key arrives): first WITHOUT 20261007000000_security_org_tier_and_admin_lockdown.sql, to
// show each attack works, then WITH it, to show each one is refused and the legitimate paths still
// work. Stops and deletes the cluster afterwards. It never connects to Supabase.
//
//   node supabase/tests/security_lockdown/run.mjs
//
// PG_BIN (default: C:/Program Files/PostgreSQL/18/bin) and PG_TEST_PORT (default 55433) can be set.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const migrations = path.join(repo, 'supabase', 'migrations');
const pgBin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const port = String(process.env.PG_TEST_PORT ?? 55433);
const exe = (name) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-security-lockdown-'));
const conn = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-X', '-t', '-A'];
const env = { ...process.env, PGCLIENTENCODING: 'UTF8' };
const audits = path.join(repo, 'supabase', 'audits');
/** Runs one of the read-only production scripts and returns its rows as arrays of fields. */
function runScript(file, { allowFail = false } = {}) {
  const result = spawnSync(exe('psql'), [...conn, '-F', '|', '-f', path.join(audits, file)], { encoding: 'utf8', env });
  if (result.status !== 0 && !allowFail) throw new Error(`${file} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.split('\n').filter(Boolean).map((line) => line.split('|'));
}
/** The pre-flight's summary (section 4) as { item: status } and its production-table report (section 3) as { table: status }. */
function preflightReport() {
  const rows = runScript('20261007_production_preflight.sql');
  const summary = Object.fromEntries(rows.filter((row) => row[0] === '4' && row.length === 5).map((row) => [row[2], row[1]]));
  const tables = Object.fromEntries(rows.filter((row) => row[0] === '3' && row.length === 12).map((row) => [row[1], { status: row[11], anonymous: row[9], broad: row[10], rls: row[3], policies: row[4] }]));
  return { summary, tables };
}
const VERIFY_AREAS = new Set(['organizations', 'administrators', 'entitlements', 'seats', 'autonomous runs', 'functions', 'row level security', 'policies', 'wallets', 'usage']);
// Tables the script requires row level security on that this scratch database does not create
// (their own migrations are not under test here). In production they exist and are checked.
const NOT_IN_SCRATCH = new Set(['on for connectivity_credentials', 'on for web_chats', 'on for web_chat_messages']);
const verificationRows = () =>
  runScript('20261007_post_migration_verification.sql').filter((row) => row.length === 4 && VERIFY_AREAS.has(row[0]) && !NOT_IN_SCRATCH.has(row[1]));
const snapshot = () => psql(`select md5(string_agg(t, ',' order by t)) from (
  select 'org:' || md5(o::text) as t from organizations o union all select 'mem:' || md5(m::text) from organization_members m
  union all select 'ent:' || md5(e::text) from user_entitlements e union all select 'adm:' || md5(a::text) from pawos_admins a
  union all select 'padm:' || md5(a::text) from platform_admins a) x`, 'snapshot').out;

const PREREQUISITES = [
  '20260720000000_help_center_phase1.sql', // organizations, organization_members, platform_admins, diagnostics
  '20260721000300_fix_organization_members_rls_recursion.sql', // is_org_member / is_org_manager + policies
  '20260721000400_organization_invite_acceptance.sql', // accept_organization_invite()
  '20260723000100_team_seat_tier.sql', // organization_members.seat_tier
  '20260924000000_pawos_build_access.sql', // pawos_admins, pawos_is_build_admin()
  '20260925060000_pawos_subscriptions.sql',
];
const UNDER_TEST = '20261007000000_security_org_tier_and_admin_lockdown.sql';
const UNDER_TEST_2 = '20261007010000_security_seats_and_admin_identity.sql';
const UNDER_TEST_3 = '20261007020000_security_function_hardening.sql';
// Applied after fixture.sql, which provides the autonomous_task_runs stand-in it references.
const UNDER_TEST_4 = '20261007030000_security_wallet_function_lockdown.sql';
const UNDER_TEST_5 = '20261007040000_security_usage_cannot_decrease.sql';
const AFTER_FIXTURE = [
  '20260907000001_autonomous_external_writes_idempotency.sql',
  '20260724000000_prepaid_task_credits.sql', // add_task_credits
  '20260726020000_ticket_balance_wallet.sql', // add_ticket_balance
  '20260814000000_p0_payment_verification_hardening.sql', // add_ticket_balance_service + the revoke that did not take
  '20260730010000_usage_engine.sql', // organization_usage_counters, counter_add_like_definer()
  '20260916000002_go_refresh_and_enterprise.sql', // record_enterprise_api_usage()
];
const SQUATTER = { id: '66666666-6666-6666-6666-666666666666', email: 'pawos@revantaai.com' };
const INVITEE = { id: '88888888-8888-8888-8888-888888888888', email: 'invitee@paying-team.test' };

const ATTACKER = { id: '11111111-1111-1111-1111-111111111111', email: 'free-user@attacker.test' };
const PRO = { id: '22222222-2222-2222-2222-222222222222', email: 'pro-user@customer.test' };
const TEAM_OWNER = { id: '33333333-3333-3333-3333-333333333333', email: 'owner@paying-team.test' };
const TEAM_MEMBER = { id: '44444444-4444-4444-4444-444444444444', email: 'member@paying-team.test' };
const ADMIN = { id: '55555555-5555-5555-5555-555555555555', email: 'founder@revantaai.com' };
const PAID_ORG = '99999999-9999-9999-9999-999999999999';

function psql(sql, label, { allowFail = false } = {}) {
  const result = spawnSync(exe('psql'), conn, { encoding: 'utf8', env, input: sql });
  if (result.status !== 0 && !allowFail) throw new Error(`${label} failed:\n${result.stdout}\n${result.stderr}`);
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}
const psqlFile = (file) => {
  const result = spawnSync(exe('psql'), [...conn, '-f', file], { encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(`psql ${path.basename(file)} failed:\n${result.stdout}\n${result.stderr}`);
};

/** Runs SQL the way a request with the public key and this user's session arrives: role `authenticated`, the user's JWT claims. Always rolled back. */
function asUser(user, sql) {
  return psql(
    `begin;
     select set_config('request.jwt.claim.sub', '${user.id}', true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.email', '${user.email}', true) \\gset ignored_
     set local role authenticated;
     ${sql}
     rollback;`,
    'asUser',
    { allowFail: true }
  );
}
/** The service role (pawos-web after a verified payment). Committed. */
const asService = (sql) => psql(`begin; select set_config('request.jwt.claim.role', 'service_role', true) \\gset ignored_\n set local role service_role; ${sql}; commit;`, 'asService', { allowFail: true });

let failed = 0;
const results = [];
function check(name, passed, detail = '') {
  results.push(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!passed) failed++;
}
const refused = (r) => !r.ok && /42501|permission denied|managed by PawOS billing|created on the free plan|row-level security/i.test(r.err);
const reason = (r) => (r.ok ? `allowed (returned: ${r.out || 'ok'})` : r.err.split('\n')[0].replace(/^psql:.*?ERROR:\s*/, ''));

const ATTACKS = {
  'create an Enterprise organization': (u) =>
    asUser(u, `insert into organizations (slug, name, tier, owner_user_id) values ('evil-ent', 'Evil', 'enterprise', '${u.id}');`),
  'create a Team organization': (u) => asUser(u, `insert into organizations (slug, name, tier, owner_user_id) values ('evil-team', 'Evil', 'team', '${u.id}');`),
  'create a free organization, then raise its tier': (u) =>
    asUser(u, `insert into organizations (slug, name, tier, owner_user_id) values ('evil-go', 'Evil', 'go', '${u.id}'); update organizations set tier = 'enterprise' where slug = 'evil-go';`),
  'create a free organization with a pre-set API budget': (u) =>
    asUser(u, `insert into organizations (slug, name, tier, owner_user_id, api_budget_usd) values ('evil-budget', 'Evil', 'go', '${u.id}', 100000);`),
  'reset own organization API usage / raise seats': (u) =>
    asUser(u, `insert into organizations (slug, name, tier, owner_user_id) values ('evil-go2', 'Evil', 'go', '${u.id}'); update organizations set seat_count = 500, api_usage_usd = 0, api_budget_usd = 99999 where slug = 'evil-go2';`),
  'read the platform admin list': (u) => asUser(u, `select count(*) from platform_admins;`),
  'add own email to platform_admins': (u) => asUser(u, `insert into platform_admins (email) values ('${u.email}');`),
  'delete an existing platform admin': (u) => asUser(u, `delete from platform_admins where email = '${ADMIN.email}' returning email;`),
};

let started = false;
try {
  const init = spawnSync(exe('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'], { encoding: 'utf8', env });
  if (init.status !== 0) throw new Error(`initdb failed:\n${init.stderr}`);
  const start = spawnSync(exe('pg_ctl'), ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-l', path.join(dataDir, 'server.log'), '-w', 'start'], { env, stdio: 'ignore' });
  if (start.status !== 0) throw new Error('pg_ctl start failed');
  started = true;

  psqlFile(path.join(repo, 'supabase', 'tests', 'web_tier', 'local_stub.sql'));
  psqlFile(path.join(here, 'bootstrap.sql'));
  for (const file of PREREQUISITES) psqlFile(path.join(migrations, file));
  psqlFile(path.join(here, 'fixture.sql'));
  for (const file of AFTER_FIXTURE) psqlFile(path.join(migrations, file));

  // ── Production pre-flight script, against the pre-migration schema ──────────────────────────
  const beforePreflight = snapshot();
  const preflight = runScript('20261007_production_preflight.sql').filter((row) => row[0] === '1' && row.length === 6);
  const blocking = preflight.filter((row) => row[3] === 'f' && row[4] === 't');
  check('pre-flight: runs against the pre-migration schema and reports its checks', preflight.length >= 30, `${preflight.length} checks`);
  check('pre-flight: nothing blocking is missing', blocking.length === 0, blocking.map((row) => row[2]).join('; '));
  check('pre-flight: reports what the migrations will create as non-blocking', preflight.some((row) => row[2] === 'column autonomous_external_writes.updated_at' && row[3] === 'f' && row[4] === 'f'));
  check('pre-flight: is read-only (nothing changed)', snapshot() === beforePreflight);
  // The summary, before any migration: every opening the migrations close is BLOCKING.
  const pre = preflightReport();
  for (const item of ['wallet credit without payment', 'administrator list open to clients', 'tier, seats and entitlements writable by clients', 'recorded usage can be lowered']) {
    check(`pre-flight summary (before): "${item}" is BLOCKING`, pre.summary[item] === 'BLOCKING', pre.summary[item]);
  }
  check('pre-flight summary (before): required columns are present', pre.summary['columns the migrations require'] === 'OK', pre.summary['columns the migrations require']);
  for (const item of ['Team / Enterprise organizations to confirm', 'stored tiers the server cannot account for', 'existing Premium members and seat counts', 'wallet top-ups with no payment behind them']) {
    check(`pre-flight summary: "${item}" is REVIEW, never automatic`, pre.summary[item] === 'REVIEW', pre.summary[item]);
  }

  // The production-only tables: each state the script must tell apart.
  check('pre-flight tables: a table that does not exist is reported for review', /^REVIEW: table not found/.test(pre.tables.billing_cases?.status ?? ''), pre.tables.billing_cases?.status);
  check('pre-flight tables: all eight are reported', Object.keys(pre.tables).length === 8, Object.keys(pre.tables).join(', '));
  const tableState = (setup) => {
    psql(`drop table if exists public.billing_cases cascade; create table public.billing_cases (id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, amount numeric); ${setup}`, 'billing_cases state');
    return preflightReport().tables.billing_cases;
  };
  let state = tableState('');
  check('pre-flight tables: no row level security → BLOCKING', /^BLOCKING: no row level security/.test(state.status) && state.broad === 't', JSON.stringify(state));
  state = tableState('alter table public.billing_cases enable row level security;');
  check('pre-flight tables: row level security with no client policy → OK (server-only)', /^OK: server-only/.test(state.status) && state.anonymous === 'f' && state.broad === 'f', JSON.stringify(state));
  state = tableState('alter table public.billing_cases enable row level security; create policy open_all on public.billing_cases for select using (true);');
  check('pre-flight tables: a policy open to everyone → BLOCKING (reachable without signing in)', /^BLOCKING: reachable without signing in/.test(state.status) && state.anonymous === 't', JSON.stringify(state));
  state = tableState('alter table public.billing_cases enable row level security; create policy open_signed_in on public.billing_cases for all to authenticated using (true) with check (true);');
  check('pre-flight tables: a policy open to every signed-in user → BLOCKING', /^BLOCKING: a policy applies to every signed-in user/.test(state.status) && state.broad === 't' && state.anonymous === 'f', JSON.stringify(state));
  state = tableState('alter table public.billing_cases enable row level security; create policy own_rows on public.billing_cases for select using (user_id = auth.uid()); create policy own_insert on public.billing_cases for insert with check (user_id = auth.uid());');
  check('pre-flight tables: caller-scoped policies → REVIEW (a person reads them)', /^REVIEW: read each policy/.test(state.status) && state.broad === 'f' && state.policies === '2', JSON.stringify(state));
  check('pre-flight summary: an open policy anywhere is BLOCKING', (() => {
    psql('create policy open_all on public.billing_cases for select using (true);', 'open policy');
    const blocked = preflightReport().summary['policies that apply to every caller alike'] === 'BLOCKING';
    psql('drop table public.billing_cases cascade;', 'drop billing_cases');
    return blocked;
  })());

  // A schema that really is missing something the migrations need must be reported as blocking.
  psql('alter table user_entitlements rename column tier to tier_renamed;', 'break schema');
  // Section 2's data queries stop at the missing column, as the script says they will; section 1 has already reported.
  const broken = runScript('20261007_production_preflight.sql', { allowFail: true }).filter((row) => row[0] === '1' && row[3] === 'f' && row[4] === 't');
  psql('alter table user_entitlements rename column tier_renamed to tier;', 'restore schema');
  check('pre-flight: a missing required column is reported as blocking', broken.some((row) => row[2] === 'column user_entitlements.tier'), broken.map((row) => row[2]).join('; '));

  // ── Before: the attacks work ──────────────────────────────────────────────────────────────────
  console.log('Before the migration (each attack is expected to be ALLOWED — this is the vulnerability):');
  for (const [name, attack] of Object.entries(ATTACKS)) {
    const r = attack(ATTACKER);
    console.log(`  ${r.ok ? 'allowed ' : 'refused '} ${name}${r.ok ? '' : `  (${reason(r)})`}`);
    check(`before: "${name}" is possible`, r.ok, reason(r));
  }
  const selfTierBefore = asUser(ATTACKER, `select sync_my_entitlement_tier('enterprise'); select tier from user_entitlements where user_id = '${ATTACKER.id}';`);
  console.log(`  ${selfTierBefore.out.includes('enterprise') ? 'allowed ' : 'refused '} declare own tier as enterprise`);
  check('before: a free user can declare themselves enterprise', selfTierBefore.out.includes('enterprise'), reason(selfTierBefore));
  // Leave a forged row behind, the way a real attacker would have.
  psql(`insert into user_entitlements (user_id, tier) values ('${ATTACKER.id}', 'enterprise') on conflict (user_id) do update set tier = 'enterprise';`, 'forged row');

  // ── Apply the migration ───────────────────────────────────────────────────────────────────────
  psqlFile(path.join(migrations, UNDER_TEST));
  psqlFile(path.join(migrations, UNDER_TEST)); // and again: it must be safe to re-run

  // ── After: the attacks are refused ────────────────────────────────────────────────────────────
  console.log('\nAfter the migration (each attack is expected to be REFUSED):');
  for (const [name, attack] of Object.entries(ATTACKS)) {
    const r = attack(ATTACKER);
    console.log(`  ${r.ok ? 'ALLOWED ' : 'refused '} ${name}  (${reason(r)})`);
    check(`after: "${name}" is refused`, refused(r), reason(r));
  }

  const q = (sql) => psql(sql, 'query').out;
  check('after: the migration did not rewrite the stored tier (no automatic downgrade)', q(`select tier from user_entitlements where user_id = '${ATTACKER.id}'`) === 'enterprise');
  check('after: the unaccounted-for tier is flagged for manual review', q(`select stored_tier || '>' || derived_tier from pawos_entitlement_review where user_id = '${ATTACKER.id}'`) === 'enterprise>go');
  check('after: accounts whose stored tier is supported are not flagged', q(`select count(*) from pawos_entitlement_review`) === '1');
  check('after: a normal user cannot read the review list', !asUser(ATTACKER, `select count(*) from pawos_entitlement_review;`).ok);
  const selfTierAfter = asUser(ATTACKER, `select sync_my_entitlement_tier('enterprise'); select tier from user_entitlements where user_id = '${ATTACKER.id}';`);
  check('after: declaring enterprise stores go for a free user', selfTierAfter.ok && selfTierAfter.out.endsWith('go'), reason(selfTierAfter));
  check('after: is_platform_admin() does not answer about someone else', asUser(ATTACKER, `select is_platform_admin('${ADMIN.email}');`).out === 'f');
  check('after: a non-admin cannot read diagnostic reports of others', asUser(ATTACKER, `select count(*) from diagnostic_reports;`).out === '0');

  // ── After: legitimate behaviour is intact ─────────────────────────────────────────────────────
  const freeOrg = asUser(ATTACKER, `insert into organizations (slug, name, tier, owner_user_id) values ('my-org', 'My org', 'go', '${ATTACKER.id}') returning tier;`);
  check('legit: a user can still create a free organization', freeOrg.ok && freeOrg.out.includes('go'), reason(freeOrg));
  const rename = asUser(TEAM_OWNER, `update organizations set name = 'Renamed' where id = '${PAID_ORG}' returning name;`);
  check('legit: an owner can still rename their organization', rename.ok && rename.out.includes('Renamed'), reason(rename));
  const upgrade = asService(`update organizations set tier = 'enterprise', seat_count = 20 where id = '${PAID_ORG}'`);
  check('legit: the service role (verified payment) can set tier and seats', upgrade.ok && q(`select tier || ':' || seat_count from organizations where id = '${PAID_ORG}'`) === 'enterprise:20', reason(upgrade));
  asService(`update organizations set tier = 'team', seat_count = 5 where id = '${PAID_ORG}'`);
  const serviceCreate = asService(`insert into organizations (slug, name, tier, owner_user_id, seat_count) values ('paid-new', 'Paid', 'team', '${PRO.id}', 2)`);
  check('legit: the service role can create a paid organization', serviceCreate.ok, reason(serviceCreate));
  const usage = asUser(TEAM_MEMBER, `select record_usage_like_definer('${PAID_ORG}', 1.25); select api_usage_usd from organizations where id = '${PAID_ORG}';`);
  check('legit: a SECURITY DEFINER usage function can still update api_usage_usd', usage.ok && usage.out.endsWith('1.25'), reason(usage));
  check('legit: an admin still passes is_platform_admin()', asUser(ADMIN, `select is_platform_admin('${ADMIN.email}');`).out === 't');
  check('legit: an admin can still read diagnostic reports', asUser(ADMIN, `select count(*) from diagnostic_reports;`).out === '1');
  check('legit: the platform admin list is unchanged', q(`select string_agg(email, ',' order by email) from platform_admins`) === ADMIN.email);

  const tierOf = (user) => asUser(user, `select sync_my_entitlement_tier('go'); select tier from user_entitlements where user_id = '${user.id}';`).out.split('\n').pop();
  check('tier: Free account → go', tierOf(ATTACKER) === 'go');
  check('tier: paid Pro subscription → pro (even when the client says go)', tierOf(PRO) === 'pro');
  check('tier: Team organization member → team', tierOf(TEAM_MEMBER) === 'team');
  check('tier: Team organization owner → team', tierOf(TEAM_OWNER) === 'team');
  psql(`update pawos_subscriptions set tier = 'proMax', pro_max_variant = '5x' where user_id = '${PRO.id}'`, 'pro max');
  check('tier: paid Pro Max subscription → proMax', tierOf(PRO) === 'proMax');
  psql(`update pawos_subscriptions set current_period_end = now() - interval '1 day' where user_id = '${PRO.id}'`, 'lapse');
  check('tier: lapsed subscription → go', tierOf(PRO) === 'go');
  asService(`update organizations set tier = 'enterprise' where id = '${PAID_ORG}'`);
  check('tier: Enterprise organization member → enterprise', tierOf(TEAM_MEMBER) === 'enterprise');
  psql(`update organization_members set status = 'removed' where user_id = '${TEAM_MEMBER.id}'`, 'remove member');
  check('tier: removed member → go', tierOf(TEAM_MEMBER) === 'go');

  // ═════ Second migration: seats and administrator identity ═════════════════════════════════════
  // State: the paying organization is Enterprise from the checks above; put it back to a 3-seat
  // Standard Team with its owner and one member active.
  asService(`update organizations set tier = 'team', seat_count = 3 where id = '${PAID_ORG}'`);
  psql(`update organization_members set status = 'active' where user_id = '${TEAM_MEMBER.id}'`, 'restore member');
  const member = (user) => `(select id from organization_members where organization_id = '${PAID_ORG}' and user_id = '${user.id}')`;
  const SEAT_ATTACKS = {
    'owner marks a member Premium without Premium seats': () => asUser(TEAM_OWNER, `update organization_members set seat_tier = 'premium' where id = ${member(TEAM_MEMBER)} returning seat_tier;`),
    'owner invites a new member straight onto a Premium seat': () =>
      asUser(TEAM_OWNER, `insert into organization_members (organization_id, email, role, status, seat_tier) values ('${PAID_ORG}', 'new@paying-team.test', 'member', 'invited', 'premium');`),
    'owner adds other accounts as active members, beyond the paid seats and without their acceptance': () =>
      asUser(
        TEAM_OWNER,
        `insert into organization_members (organization_id, user_id, email, role, status) values ('${PAID_ORG}', '${ATTACKER.id}', 'a@paying-team.test', 'member', 'active');
         insert into organization_members (organization_id, user_id, email, role, status) values ('${PAID_ORG}', '${PRO.id}', 'b@paying-team.test', 'member', 'active');`
      ),
    'owner raises seat_count or paid_premium_seats on their own organization': () => asUser(TEAM_OWNER, `update organizations set paid_premium_seats = 5 where id = '${PAID_ORG}'; update organizations set seat_count = 50 where id = '${PAID_ORG}';`),
  };
  // An address on the admin allow-list that had no account: someone registers it.
  const squatBefore = asUser(SQUATTER, `select pawos_is_build_admin();`);

  console.log('\nBefore the second migration (expected ALLOWED — the vulnerability):');
  for (const [name, attack] of Object.entries(SEAT_ATTACKS)) {
    if (name.includes('paid_premium_seats')) continue; // the column does not exist yet
    const r = attack();
    console.log(`  ${r.ok ? 'allowed ' : 'refused '} ${name}${r.ok ? '' : `  (${reason(r)})`}`);
    check(`before: "${name}" is possible`, r.ok, reason(r));
  }
  console.log(`  ${squatBefore.out === 't' ? 'allowed ' : 'refused '} whoever registers an allow-listed admin email becomes an admin`);
  check('before: registering an allow-listed admin email grants admin', squatBefore.out === 't', reason(squatBefore));

  psqlFile(path.join(migrations, UNDER_TEST_2));
  psqlFile(path.join(migrations, UNDER_TEST_2)); // safe to re-run
  psqlFile(path.join(migrations, UNDER_TEST)); // and the first one after it must not undo it
  psqlFile(path.join(migrations, UNDER_TEST_2));

  console.log('\nAfter the second migration (expected REFUSED):');
  for (const [name, attack] of Object.entries(SEAT_ATTACKS)) {
    const r = attack();
    console.log(`  ${r.ok ? 'ALLOWED ' : 'refused '} ${name}  (${reason(r)})`);
    check(`after: "${name}" is refused`, !r.ok && /42501|Premium seat|paid seats|managed by PawOS billing|accepting its own invite/i.test(r.err), reason(r));
  }

  // Legitimate seat management still works.
  const standard = asUser(TEAM_OWNER, `update organization_members set seat_tier = 'standard' where id = ${member(TEAM_MEMBER)} returning seat_tier;`);
  check('legit: an owner can assign a Standard seat', standard.ok && standard.out.includes('standard'), reason(standard));
  const invite = asUser(TEAM_OWNER, `insert into organization_members (organization_id, email, role, status, seat_tier) values ('${PAID_ORG}', 'later@paying-team.test', 'member', 'invited', 'standard') returning status;`);
  check('legit: an owner can invite a member on a Standard seat', invite.ok && invite.out.includes('invited'), reason(invite));
  const role = asUser(TEAM_OWNER, `update organization_members set role = 'billingAdministrator' where id = ${member(TEAM_MEMBER)} returning role;`);
  check('legit: changing a role does not count as taking a seat', role.ok && role.out.includes('billingAdministrator'), reason(role));

  // The invite path (a SECURITY DEFINER function called by the invited user) is held to the cap too.
  psql(
    `insert into auth.users (id, email, email_confirmed_at) values ('${INVITEE.id}', '${INVITEE.email}', now());
     insert into organization_members (organization_id, email, role, status) values ('${PAID_ORG}', '${INVITEE.email}', 'member', 'invited'), ('${PAID_ORG}', '${ATTACKER.email}', 'member', 'invited');`,
    'two invites, one free seat'
  );
  const accept = (user) =>
    psql(
      `begin;
       select set_config('request.jwt.claim.sub', '${user.id}', true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.email', '${user.email}', true) \\gset ignored_
       set local role authenticated;
       select accept_organization_invite('${PAID_ORG}');
       commit;`,
      'accept invite',
      { allowFail: true }
    );
  const firstAccept = accept(INVITEE);
  check('legit: an invited member takes the last free seat', q(`select status from organization_members where organization_id = '${PAID_ORG}' and email = '${INVITEE.email}'`) === 'active', reason(firstAccept));
  const overAccept = accept(ATTACKER);
  check('after: accepting an invite beyond the paid seats is refused', !overAccept.ok && /paid seats/.test(overAccept.err), reason(overAccept));

  // Seats are added only by a verified payment, through the server-only function.
  const buySeats = (paymentId, tier, seats, buyer = TEAM_OWNER) =>
    asService(`select pawos_apply_seat_purchase('${paymentId}', 'order_${paymentId}', '${PAID_ORG}', '${buyer.id}', '${tier}', ${seats})`);
  const seatState = () => q(`select seat_count || '/' || paid_premium_seats from organizations where id = '${PAID_ORG}'`);
  const clientBuy = asUser(TEAM_OWNER, `select pawos_apply_seat_purchase('pay_forged', 'order_forged', '${PAID_ORG}', '${TEAM_OWNER.id}', 'premium', 50);`);
  check('after: a signed-in user cannot call the seat purchase function', !clientBuy.ok && /permission denied|42501|backend-only/i.test(clientBuy.err), reason(clientBuy));
  check('after: paid seats are unchanged by the refused attempts', seatState() === '3/0', seatState());

  const premiumBought = buySeats('pay_premium_1', 'premium', 1);
  check('legit: a verified Premium seat payment adds one seat and one Premium seat', premiumBought.ok && seatState() === '4/1', `${reason(premiumBought)}; seats ${seatState()}`);
  const replay = buySeats('pay_premium_1', 'premium', 1);
  check('after: verifying the same payment again adds nothing', replay.ok && seatState() === '4/1', seatState());
  const premium = asUser(TEAM_OWNER, `update organization_members set seat_tier = 'premium' where id = ${member(TEAM_MEMBER)} returning seat_tier;`);
  check('legit: a member can be put on the Premium seat that was bought', premium.ok && premium.out.includes('premium'), reason(premium));
  psql(`update organization_members set seat_tier = 'premium' where id = ${member(TEAM_MEMBER)}`, 'premium member (committed)');
  const secondPremium = asUser(TEAM_OWNER, `update organization_members set seat_tier = 'premium' where id = ${member(PRO)} returning seat_tier;`);
  const secondPremiumNew = asUser(TEAM_OWNER, `update organization_members set seat_tier = 'premium' where organization_id = '${PAID_ORG}' and email = '${INVITEE.email}' returning seat_tier;`);
  check('after: a second member cannot take a Premium seat when one was bought', !secondPremiumNew.ok && /Premium seat/.test(secondPremiumNew.err), `${reason(secondPremium)} | ${reason(secondPremiumNew)}`);

  // The cap was reached above (3 active of 3). The payment added a 4th seat: the refused invite now fits.
  const acceptAfterPurchase = accept(ATTACKER);
  check('legit: after a payment adds a seat, the waiting invite can be accepted', q(`select status from organization_members where organization_id = '${PAID_ORG}' and email = '${ATTACKER.email}'`) === 'active', reason(acceptAfterPurchase));
  psql(`update auth.users set email_confirmed_at = now() where id = '${SQUATTER.id}';
        insert into organization_members (organization_id, email, role, status) values ('${PAID_ORG}', '${SQUATTER.email}', 'member', 'invited');`, 'fifth invite');
  const fifth = accept(SQUATTER);
  check('after: a fifth member cannot accept an invite with four paid seats', !fifth.ok && /paid seats/.test(fifth.err), reason(fifth));
  psql(`delete from organization_members where organization_id = '${PAID_ORG}' and email = '${SQUATTER.email}'`, 'drop fifth invite');
  const standardBought = buySeats('pay_standard_2', 'standard', 2);
  check('legit: a verified Standard payment for two seats adds two seats and no Premium seat', standardBought.ok && seatState() === '6/1', seatState());
  const outsider = buySeats('pay_outsider', 'standard', 1, ATTACKER);
  psql(`update organization_members set status = 'removed' where organization_id = '${PAID_ORG}' and email = '${ATTACKER.email}'`, 'remove the outsider membership');
  const stranger = asService(`select pawos_apply_seat_purchase('pay_stranger', 'order_stranger', '${PAID_ORG}', '${SQUATTER.id}', 'standard', 1)`);
  check('after: a payment whose buyer does not manage the organization adds nothing', !stranger.ok && /buyer_does_not_manage_organization/.test(stranger.err) && !outsider.ok, `${reason(stranger)} | ${reason(outsider)}`);
  const badQty = buySeats('pay_bad', 'standard', 0);
  check('after: an invalid seat quantity or tier is refused', !badQty.ok && !asService(`select pawos_apply_seat_purchase('pay_bad2', 'o', '${PAID_ORG}', '${TEAM_OWNER.id}', 'ultra', 1)`).ok, reason(badQty));
  check('after: seat purchases are recorded once per payment', q(`select count(*) || ':' || sum(seats) from organization_seat_purchases where organization_id = '${PAID_ORG}'`) === '2:3');
  check('after: a normal user cannot read the seat purchase ledger', !asUser(TEAM_OWNER, `select count(*) from organization_seat_purchases;`).ok);
  const freeOrgMembers = asUser(
    ATTACKER,
    `insert into organizations (id, slug, name, tier, owner_user_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'free-club', 'Free club', 'go', '${ATTACKER.id}');
     insert into organization_members (organization_id, user_id, email, role, status) values ('aaaaaaaa-0000-0000-0000-000000000001', '${ATTACKER.id}', '${ATTACKER.email}', 'owner', 'active') returning status;`
  );
  check('legit: a free organization can still add its owner as a member', freeOrgMembers.ok, reason(freeOrgMembers));

  // Administrator identity.
  check('after: registering an allow-listed admin email no longer grants admin', asUser(SQUATTER, `select pawos_is_build_admin();`).out === 'f');
  check('legit: the founder, whose account existed and was bound, is still an admin', asUser(ADMIN, `select pawos_is_build_admin();`).out === 't');
  check('after: a normal user is not an admin', asUser(ATTACKER, `select pawos_is_build_admin();`).out === 'f');
  check('after: pawos_admins holds the bound account id', q(`select user_id from pawos_admins where email = '${ADMIN.email}'`) === ADMIN.id);
  check('after: the unbound allow-listed address has no account bound', q(`select coalesce(user_id::text, 'none') from pawos_admins where email = '${SQUATTER.email}'`) === 'none');
  check(
    'after: a normal user cannot read or change pawos_admins',
    !asUser(ATTACKER, `select count(*) from pawos_admins;`).ok && !asUser(ATTACKER, `update pawos_admins set user_id = '${ATTACKER.id}' where email = '${SQUATTER.email}';`).ok
  );

  // ═════ Plan payments are applied once and never lower the seat counts ═══════════════════════════
  const planBefore = seatState();
  const applyPlan = (paymentId, tier, seatTier, seats, buyer = TEAM_OWNER) =>
    asService(`select pawos_apply_plan_purchase('${paymentId}', 'order_${paymentId}', '${PAID_ORG}', '${buyer.id}', '${tier}', ${seatTier ? `'${seatTier}'` : 'null'}, ${seats})`);
  const oldPlan = applyPlan('pay_plan_original', 'team', 'standard', 2);
  check('plan: verifying the original 2-seat plan payment after seats were added does not reset them', oldPlan.ok && seatState() === planBefore, `before ${planBefore}, after ${seatState()}`);
  const oldPlanAgain = applyPlan('pay_plan_original', 'team', 'standard', 2);
  check('plan: the same plan payment verified again reports nothing applied', oldPlanAgain.ok && /"applied": ?false/.test(oldPlanAgain.out) && seatState() === planBefore, oldPlanAgain.out);
  const biggerPlan = applyPlan('pay_plan_renewal', 'team', 'premium', 8);
  check('plan: a new plan payment for more seats raises the counts (8 seats, 8 Premium)', biggerPlan.ok && seatState() === '8/8', seatState());
  const strangerPlan = applyPlan('pay_plan_stranger', 'enterprise', null, 50, ATTACKER);
  check('plan: a payment by someone who does not own the organization is refused', !strangerPlan.ok && /buyer_does_not_own_organization/.test(strangerPlan.err) && q(`select tier from organizations where id = '${PAID_ORG}'`) === 'team', reason(strangerPlan));
  const clientPlan = asUser(TEAM_OWNER, `select pawos_apply_plan_purchase('pay_forged_plan', 'o', '${PAID_ORG}', '${TEAM_OWNER.id}', 'enterprise', null, 1000);`);
  check('plan: a signed-in user cannot call the plan function', !clientPlan.ok && /permission denied|42501|backend-only/i.test(clientPlan.err), reason(clientPlan));
  check('plan: a normal user cannot read the plan purchase ledger', !asUser(TEAM_OWNER, `select count(*) from organization_plan_purchases;`).ok);

  // ═════ Roles and identities on membership rows ══════════════════════════════════════════════════
  // TEAM_MEMBER becomes an organization administrator (an admin, not the owner).
  psql(`update organization_members set role = 'organizationAdministrator' where id = ${member(TEAM_MEMBER)}`, 'make admin');
  const ownerRow = member(TEAM_OWNER);
  const inviteeRow = `(select id from organization_members where organization_id = '${PAID_ORG}' and email = '${INVITEE.email}')`;
  const ROLE_ATTACKS = {
    'an admin makes themselves owner': () => asUser(TEAM_MEMBER, `update organization_members set role = 'owner' where id = ${member(TEAM_MEMBER)} returning role;`),
    'an admin grants the owner role to someone else': () => asUser(TEAM_MEMBER, `update organization_members set role = 'organizationOwner' where id = ${inviteeRow} returning role;`),
    'an admin demotes the owner': () => asUser(TEAM_MEMBER, `update organization_members set role = 'member' where id = ${ownerRow} returning role;`),
    'an admin removes the owner': () => asUser(TEAM_MEMBER, `update organization_members set status = 'removed' where id = ${ownerRow} returning status;`),
    "an admin deletes the owner's membership": () => asUser(TEAM_MEMBER, `delete from organization_members where id = ${ownerRow} returning id;`),
    'an admin invites someone directly as owner': () => asUser(TEAM_MEMBER, `insert into organization_members (organization_id, email, role, status) values ('${PAID_ORG}', 'x@paying-team.test', 'owner', 'invited');`),
    'an admin moves a membership to another organization': () =>
      asUser(TEAM_MEMBER, `update organization_members set organization_id = 'aaaaaaaa-0000-0000-0000-00000000000a' where id = ${inviteeRow} returning id;`),
    'an admin hands a membership to a different account': () => asUser(TEAM_MEMBER, `update organization_members set user_id = '${SQUATTER.id}' where id = ${inviteeRow} returning id;`),
    'an admin adds an account as an active member without its acceptance': () =>
      asUser(TEAM_MEMBER, `insert into organization_members (organization_id, user_id, email, role, status) values ('${PAID_ORG}', '${SQUATTER.id}', '${SQUATTER.email}', 'member', 'active');`),
    'an admin marks an unaccepted invite active': () => asUser(TEAM_MEMBER, `insert into organization_members (organization_id, email, role, status) values ('${PAID_ORG}', 'y@paying-team.test', 'member', 'active');`),
  };
  for (const [name, attack] of Object.entries(ROLE_ATTACKS)) {
    const r = attack();
    check(`roles: "${name}" is refused`, !r.ok && /42501|owner|invite|another organization|another account|accepted|row-level security/i.test(r.err), reason(r));
  }
  const plainMember = asUser(INVITEE, `update organization_members set role = 'billingAdministrator' where organization_id = '${PAID_ORG}' and user_id = '${INVITEE.id}' returning role;`);
  check('roles: a plain member cannot change their own role (row level security hides the write)', plainMember.ok && plainMember.out === '', reason(plainMember));
  const plainOther = asUser(INVITEE, `update organization_members set status = 'removed' where id = ${member(TEAM_MEMBER)} returning status;`);
  check('roles: a plain member cannot remove another member', plainOther.ok && plainOther.out === '', reason(plainOther));
  const outsiderRead = asUser(SQUATTER, `select count(*) from organization_members where organization_id = '${PAID_ORG}';`);
  check("roles: an outsider cannot read the organization's members", outsiderRead.out === '0', reason(outsiderRead));
  const outsiderOrg = asUser(SQUATTER, `select count(*) from organizations where id = '${PAID_ORG}';`);
  check('roles: an outsider cannot read the organization', outsiderOrg.out === '0', reason(outsiderOrg));
  const adminRole = asUser(TEAM_MEMBER, `update organization_members set role = 'workspaceAdministrator' where id = ${inviteeRow} returning role;`);
  check('legit: an admin can still change a member to a non-owner role', adminRole.ok && adminRole.out.includes('workspaceAdministrator'), reason(adminRole));
  const adminRemove = asUser(TEAM_MEMBER, `update organization_members set status = 'removed' where id = ${inviteeRow} returning status;`);
  check('legit: an admin can still remove a member', adminRemove.ok && adminRemove.out.includes('removed'), reason(adminRemove));
  const ownerGrant = asUser(TEAM_OWNER, `update organization_members set role = 'owner' where id = ${member(TEAM_MEMBER)} returning role;`);
  check('legit: the owner can grant the owner role', ownerGrant.ok && ownerGrant.out.includes('owner'), reason(ownerGrant));
  const ownerInvite = asUser(TEAM_OWNER, `insert into organization_members (organization_id, email, role, status) values ('${PAID_ORG}', 'z@paying-team.test', 'member', 'invited') returning status;`);
  check('legit: the owner can still invite by email', ownerInvite.ok && ownerInvite.out.includes('invited'), reason(ownerInvite));

  // ═════ Fourth migration: wallet functions from before server-verified payments ══════════════════
  const wallet = (user) => q(`select coalesce((select balance_usd::text from user_task_credits where user_id = '${user.id}'), 'none')`);
  const orgWallet = () => q(`select coalesce((select balance_usd::text from organization_task_credits where organization_id = '${PAID_ORG}'), 'none')`);
  const asAnon = (sql) => psql(`begin; select set_config('request.jwt.claim.role', 'anon', true) \\gset ignored_\n set local role anon; ${sql}\n rollback;`, 'asAnon', { allowFail: true });
  const WALLET_ATTACKS = {
    'a free user credits their own Ticket Balance with no payment': () => asUser(ATTACKER, `select add_ticket_balance(null, 500, 'no-payment') is not null;`),
    "a free user credits an organization's Ticket Balance with no payment": () => asUser(ATTACKER, `select add_ticket_balance('${PAID_ORG}', 20000, 'no-payment') is not null;`),
    'a free user gives themselves task credits with no payment': () => asUser(ATTACKER, `select add_task_credits(null, 100000, 0, 'no-payment') is not null;`),
    'a caller who is not signed in credits an organization': () => asAnon(`select add_ticket_balance('${PAID_ORG}', 20000, 'no-payment') is not null;`),
  };
  console.log('\nBefore the fourth migration (expected ALLOWED — the vulnerability):');
  for (const [name, attack] of Object.entries(WALLET_ATTACKS)) {
    const r = attack();
    console.log(`  ${r.ok && r.out === 't' ? 'allowed ' : 'refused '} ${name}${r.ok ? '' : `  (${reason(r)})`}`);
    check(`before: "${name}" is possible`, r.ok && r.out === 't', reason(r));
  }
  check('before: the earlier "revoke ... from authenticated" left the function callable (PUBLIC still held EXECUTE)', q(`select has_function_privilege('authenticated', 'add_ticket_balance(uuid, numeric, text)', 'execute')::text`) === 'true');

  psqlFile(path.join(migrations, UNDER_TEST_4));
  psqlFile(path.join(migrations, UNDER_TEST_4)); // safe to re-run

  console.log('\nAfter the fourth migration (expected REFUSED):');
  for (const [name, attack] of Object.entries(WALLET_ATTACKS)) {
    const r = attack();
    console.log(`  ${r.ok ? 'ALLOWED ' : 'refused '} ${name}  (${reason(r)})`);
    check(`after: "${name}" is refused`, !r.ok && /permission denied/i.test(r.err), reason(r));
  }
  check('after: no wallet was credited by the refused attempts', wallet(ATTACKER) === 'none' && orgWallet() === 'none', `${wallet(ATTACKER)} / ${orgWallet()}`);
  const serviceTopup = asService(`select add_ticket_balance_service('${PRO.id}', null, 60, 'pay_real_topup')`);
  check('legit: the server can still credit a verified payment (add_ticket_balance_service)', serviceTopup.ok && wallet(PRO) === '60.00', `${reason(serviceTopup)}; wallet ${wallet(PRO)}`);
  check(
    'after: none of the three functions is executable by anon or authenticated',
    q(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('add_ticket_balance', 'add_task_credits', 'reserve_autonomous_task_pc')
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`) === '0'
  );

  // ── Wallet: the server path, duplicates and negative amounts ─────────────────────────────────
  const again = asService(`select add_ticket_balance_service('${PRO.id}', null, 60, 'pay_real_topup')`);
  check('wallet: the same payment verified twice credits once', again.ok && wallet(PRO) === '60.00', `${reason(again)}; wallet ${wallet(PRO)}`);
  const negService = asService(`select add_ticket_balance_service('${PRO.id}', null, -500, 'pay_negative')`);
  const tinyService = asService(`select add_ticket_balance_service('${PRO.id}', null, 0, 'pay_zero')`);
  check('wallet: a negative or zero credit is refused even on the server path', !negService.ok && !tinyService.ok && wallet(PRO) === '60.00', `${reason(negService)} | ${reason(tinyService)}; wallet ${wallet(PRO)}`);
  const clientService = asUser(ATTACKER, `select add_ticket_balance_service('${ATTACKER.id}', null, 500, 'pay_forged');`);
  const anonService = asAnon(`select add_ticket_balance_service('${ATTACKER.id}', null, 500, 'pay_forged');`);
  check('wallet: the server-side crediting function cannot be called by a signed-in user or without sign-in', !clientService.ok && !anonService.ok && wallet(ATTACKER) === 'none', `${reason(clientService)} | ${reason(anonService)}`);
  const directWallet = asUser(PRO, `update user_task_credits set balance_usd = 99999 where user_id = '${PRO.id}' returning balance_usd;`);
  const directInsert = asUser(ATTACKER, `insert into user_task_credits (user_id, balance_usd) values ('${ATTACKER.id}', 99999);`);
  check('wallet: a user cannot write their wallet row directly', (!directWallet.ok || directWallet.out === '') && !directInsert.ok && wallet(PRO) === '60.00', `${reason(directWallet)} | ${reason(directInsert)}`);
  const otherWallet = asUser(ATTACKER, `select count(*) from user_task_credits where user_id = '${PRO.id}';`);
  check("wallet: a user cannot read another user's wallet", otherWallet.out === '0', reason(otherWallet));

  // ═════ Fifth migration: recorded usage cannot be lowered ════════════════════════════════════════
  // The paying organization becomes Enterprise with a $100 API budget; TEAM_MEMBER is an active member.
  asService(`update organizations set tier = 'enterprise', api_budget_usd = 100, api_usage_usd = 0 where id = '${PAID_ORG}'`);
  const apiUsage = () => q(`select api_usage_usd::text from organizations where id = '${PAID_ORG}'`);
  const counter = () => q(`select coalesce((select used_amount::text from organization_usage_counters where organization_id = '${PAID_ORG}' and capability = 'test.capability'), 'none')`);
  // Committed calls, as the signed-in member.
  const asMember = (sql) =>
    psql(
      `begin;
       select set_config('request.jwt.claim.sub', '${TEAM_MEMBER.id}', true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.email', '${TEAM_MEMBER.email}', true) \\gset ignored_
       set local role authenticated;
       ${sql}
       commit;`,
      'asMember',
      { allowFail: true }
    );
  asMember(`select record_enterprise_api_usage('${PAID_ORG}', 40);`);
  asMember(`select * from counter_add_like_definer('${PAID_ORG}', 'test.capability', 7);`);
  check('usage: positive usage is recorded (before the migration)', apiUsage() === '40' && counter() === '7', `${apiUsage()} / ${counter()}`);

  // The real counter function cannot run at all as written (a non-security bug, reported).
  const realCounterFn = asUser(TEAM_MEMBER, `select count(*) from increment_organization_usage('${PAID_ORG}', 'test.capability', 1);`);
  check('note: increment_organization_usage() itself fails for every caller ("monthly_limit" is ambiguous); the counter is exercised through a stand-in', !realCounterFn.ok && /ambiguous/.test(realCounterFn.err), reason(realCounterFn));
  const USAGE_ATTACKS = {
    'a member lowers Enterprise API usage with a negative cost': () => asUser(TEAM_MEMBER, `select record_enterprise_api_usage('${PAID_ORG}', -40); select api_usage_usd from organizations where id = '${PAID_ORG}';`),
    'a member lowers a usage counter with a negative amount': () =>
      asUser(TEAM_MEMBER, `select count(*) from counter_add_like_definer('${PAID_ORG}', 'test.capability', -7); select used_amount from organization_usage_counters where organization_id = '${PAID_ORG}' and capability = 'test.capability';`),
  };
  console.log('\nBefore the fifth migration (expected ALLOWED — the vulnerability):');
  for (const [name, attack] of Object.entries(USAGE_ATTACKS)) {
    const r = attack();
    const lowered = r.ok && r.out.split('\n').pop() === '0';
    console.log(`  ${lowered ? 'allowed ' : 'refused '} ${name}${lowered ? '  (usage back to 0)' : `  (${reason(r)})`}`);
    check(`before: "${name}" is possible`, lowered, reason(r));
  }

  psqlFile(path.join(migrations, UNDER_TEST_5));
  psqlFile(path.join(migrations, UNDER_TEST_5)); // safe to re-run

  console.log('\nAfter the fifth migration (expected REFUSED):');
  for (const [name, attack] of Object.entries(USAGE_ATTACKS)) {
    const r = attack();
    console.log(`  ${r.ok ? 'ALLOWED ' : 'refused '} ${name}  (${reason(r)})`);
    check(`after: "${name}" is refused`, !r.ok && /cannot be reduced/.test(r.err), reason(r));
  }
  const moreNegative = [
    ['a tiny negative cost (-0.01)', `select record_enterprise_api_usage('${PAID_ORG}', -0.01);`, /cannot be reduced/],
    ['a huge negative cost', `select record_enterprise_api_usage('${PAID_ORG}', -1000000);`, /cannot be reduced|violates check/],
    ['a NULL cost', `select record_enterprise_api_usage('${PAID_ORG}', null);`, /must be a number|null value/],
    ['a NULL counter amount', `select count(*) from counter_add_like_definer('${PAID_ORG}', 'test.capability', null);`, /must be a number|null value/],
    ['a negative amount for a capability with no counter yet', `select count(*) from counter_add_like_definer('${PAID_ORG}', 'fresh.capability', -5);`, /cannot be reduced|below zero/],
    ['the smallest integer as a counter amount', `select count(*) from counter_add_like_definer('${PAID_ORG}', 'test.capability', -2147483648);`, /cannot be reduced|out of range/],
  ];
  for (const [name, sql, expected] of moreNegative) {
    const r = asMember(sql);
    check(`after: ${name} is refused`, !r.ok && expected.test(r.err), reason(r));
  }
  const invalidText = asMember(`select record_enterprise_api_usage('${PAID_ORG}', 'abc');`);
  const invalidNaN = asMember(`select record_enterprise_api_usage('${PAID_ORG}', 'NaN'::numeric);`);
  check('after: a non-numeric cost is refused', !invalidText.ok && /invalid input syntax/.test(invalidText.err), reason(invalidText));
  check('after: NaN as a cost does not lower or corrupt usage', apiUsage() === '40', `${reason(invalidNaN)}; usage ${apiUsage()}`);
  check('after: usage is untouched by every refused attempt', apiUsage() === '40' && counter() === '7', `${apiUsage()} / ${counter()}`);

  const zero = asMember(`select record_enterprise_api_usage('${PAID_ORG}', 0); select count(*) from counter_add_like_definer('${PAID_ORG}', 'test.capability', 0);`);
  check('legit: a zero amount is accepted and changes nothing', zero.ok && apiUsage() === '40' && counter() === '7', `${reason(zero)}; ${apiUsage()} / ${counter()}`);
  const positive = asMember(`select record_enterprise_api_usage('${PAID_ORG}', 2.5); select count(*) from counter_add_like_definer('${PAID_ORG}', 'test.capability', 3);`);
  check('legit: positive usage is still recorded', positive.ok && apiUsage() === '42.5' && counter() === '10', `${reason(positive)}; ${apiUsage()} / ${counter()}`);
  const overBudget = asMember(`select record_enterprise_api_usage('${PAID_ORG}', 1000);`);
  check('legit: the budget limit still applies', !overBudget.ok && /budget exceeded/i.test(overBudget.err) && apiUsage() === '42.5', reason(overBudget));
  const outsiderUsage = asUser(ATTACKER, `select record_enterprise_api_usage('${PAID_ORG}', 1);`);
  check('after: someone outside the organization cannot record usage against it', !outsiderUsage.ok, reason(outsiderUsage));
  const directUsage = asUser(TEAM_OWNER, `update organizations set api_usage_usd = 0 where id = '${PAID_ORG}';`);
  check('after: the owner cannot reset usage with a direct write either', !directUsage.ok && /managed by PawOS billing|cannot be reduced/.test(directUsage.err), reason(directUsage));
  const directCounter = asUser(TEAM_OWNER, `update organization_usage_counters set used_amount = 0 where organization_id = '${PAID_ORG}' returning used_amount;`);
  check('after: a usage counter cannot be written directly', (!directCounter.ok || directCounter.out === '') && counter() === '10', reason(directCounter));
  const serviceReset = asService(`update organizations set api_usage_usd = 0 where id = '${PAID_ORG}'; update organization_usage_counters set used_amount = 0 where organization_id = '${PAID_ORG}'`);
  check('legit: the service role can still reset usage (a new billing period)', serviceReset.ok && apiUsage() === '0' && counter() === '0', `${reason(serviceReset)}; ${apiUsage()} / ${counter()}`);
  asService(`update organizations set tier = 'team' where id = '${PAID_ORG}'`);

  // Organization creation where the seat column defaults to 1 (as one older migration defines it).
  const oneSeat = asUser(ATTACKER, `insert into organizations (slug, name, tier, owner_user_id, seat_count) values ('one-seat', 'One seat', 'go', '${ATTACKER.id}', 1) returning seat_count;`);
  check('legit: a free organization can be created where seat_count defaults to 1', oneSeat.ok && oneSeat.out === '1', reason(oneSeat));
  const twoSeats = asUser(ATTACKER, `insert into organizations (slug, name, tier, owner_user_id, seat_count) values ('two-seats', 'Two seats', 'go', '${ATTACKER.id}', 2);`);
  check('after: a client still cannot create an organization with more than its one default seat', !twoSeats.ok && /managed by PawOS billing/.test(twoSeats.err), reason(twoSeats));

  // ═════ Third migration: privileged functions ═══════════════════════════════════════════════════
  // The Pro user owns an autonomous run with one pending external write (a Jira comment).
  const RUN = 'bbbbbbbb-0000-0000-0000-000000000001';
  psql(
    `insert into autonomous_task_runs (id, user_id) values ('${RUN}', '${PRO.id}');
     insert into autonomous_external_writes (id, autonomous_run_id, logical_action_id, connector, external_issue_id)
       values ('cccccccc-0000-0000-0000-000000000001', '${RUN}', 'action-1', 'jira', 'PAW-1');`,
    'ledger fixture'
  );
  const RECORD = 'cccccccc-0000-0000-0000-000000000001';
  const ledgerStatus = () => q(`select status from autonomous_external_writes where id = '${RECORD}'`);
  const LEDGER_ATTACKS = {
    "mark another user's external write completed": () => asUser(ATTACKER, `select (mark_external_write_completed('${RECORD}', 'forged-comment')).status;`),
    "mark another user's external write failed": () => asUser(ATTACKER, `select (mark_external_write_failed('${RECORD}', 'forged')).status;`),
    "read another user's external write by run id": () => asUser(ATTACKER, `select (get_or_create_external_write_record('${RUN}', 'action-1', 'jira', 'PAW-1')).id;`),
  };
  console.log('\nBefore the third migration:');
  for (const [name, attack] of Object.entries(LEDGER_ATTACKS)) {
    const r = attack();
    const got = r.ok && r.out !== '';
    // The writers reach the row with no ownership check and then fail on the column no migration
    // created — for the attacker and, as checked next, for the rightful owner as well.
    const reachedRow = /column "updated_at" of relation "autonomous_external_writes" does not exist/.test(r.err);
    console.log(`  ${got ? 'allowed ' : reachedRow ? 'reached ' : 'refused '} ${name}${got ? `  (returned: ${r.out})` : `  (${reason(r)})`}`);
    check(`before: "${name}" is not stopped by any ownership check`, got || reachedRow, reason(r));
  }
  const ownerBroken = asUser(PRO, `select (mark_external_write_completed('${RECORD}', 'real-comment-id')).status;`);
  check('before: the missing updated_at column breaks the function for the rightful owner too', !ownerBroken.ok && /updated_at/.test(ownerBroken.err), reason(ownerBroken));
  const unpinnedBefore = Number(q(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')`));
  check('before: some SECURITY DEFINER functions have no fixed search_path', unpinnedBefore > 0, `${unpinnedBefore} functions`);

  psqlFile(path.join(migrations, UNDER_TEST_3));
  psqlFile(path.join(migrations, UNDER_TEST_3)); // safe to re-run

  console.log('\nAfter the third migration (expected REFUSED):');
  for (const [name, attack] of Object.entries(LEDGER_ATTACKS)) {
    const r = attack();
    // Refused = an error, or nothing returned because the row is not visible to the caller.
    const blocked = !r.ok || r.out === '';
    console.log(`  ${blocked ? 'refused ' : 'ALLOWED '} ${name}  (${r.ok ? `returned: ${r.out || 'nothing'}` : reason(r)})`);
    check(`after: "${name}" is refused`, blocked, reason(r));
  }
  check("after: the other user's record is untouched", ledgerStatus() === 'pending', ledgerStatus());
  const own = psql(
    `begin;
     select set_config('request.jwt.claim.sub', '${PRO.id}', true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.email', '${PRO.email}', true) \\gset ignored_
     set local role authenticated;
     select (mark_external_write_completed('${RECORD}', 'real-comment-id')).status;
     commit;`,
    'owner marks own record',
    { allowFail: true }
  );
  check('legit: the run owner can complete their own external write (updated_at now exists)', own.ok && ledgerStatus() === 'completed', reason(own));
  check('after: completing a write stamps updated_at', q(`select (updated_at is not null and updated_at >= completed_at - interval '1 second')::text from autonomous_external_writes where id = '${RECORD}'`) === 'true');
  check('after: updated_at is required and defaults to now for new rows', q(`select is_nullable || ':' || (column_default is not null)::text from information_schema.columns where table_name = 'autonomous_external_writes' and column_name = 'updated_at'`) === 'NO:true');
  const ownRead = asUser(PRO, `select (get_completed_external_write('${RUN}', 'action-1', 'jira', 'PAW-1')).external_comment_id;`);
  check('legit: the run owner can read their completed write', ownRead.ok && ownRead.out === 'real-comment-id', reason(ownRead));
  check('after: no SECURITY DEFINER function in public is left without a fixed search_path', q(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')`) === '0');
  // The earlier protections still hold with the pinned search_path in place.
  check('after: organization tier guard still refuses a client', refused(ATTACKS['create an Enterprise organization'](ATTACKER)));
  check('legit: membership policies still evaluate (owner reads own members)', Number(asUser(TEAM_OWNER, `select count(*) from organization_members where organization_id = '${PAID_ORG}';`).out) >= 2);
  check('legit: invite acceptance function still runs', asUser(ATTACKER, `select count(*) from list_my_pending_invites();`).ok);

  // ═════ Pre-flight summary after all five migrations: nothing left BLOCKING ═══════════════════
  const post = preflightReport();
  const stillBlocking = Object.entries(post.summary).filter(([, status]) => status === 'BLOCKING').map(([item]) => item);
  check('pre-flight summary (after): nothing is BLOCKING', stillBlocking.length === 0, stillBlocking.join('; '));
  for (const item of ['wallet credit without payment', 'administrator list open to clients', 'tier, seats and entitlements writable by clients', 'recorded usage can be lowered']) {
    check(`pre-flight summary (after): "${item}" is OK`, post.summary[item] === 'OK', post.summary[item]);
  }

  // ═════ Post-migration verification script ══════════════════════════════════════════════════════
  const beforeVerify = snapshot();
  const verified = verificationRows();
  const notPassing = verified.filter((row) => row[2] !== 't');
  check('verification: reports its checks', verified.length >= 40, `${verified.length} checks`);
  check('verification: every check passes after the three migrations', notPassing.length === 0, notPassing.map((row) => `${row[0]}: ${row[1]} (${row[3]})`).join('; '));
  check('verification: is read-only (nothing changed)', snapshot() === beforeVerify);
  // It must notice when a protection is switched off or reopened.
  const detects = (label, breakSql, restoreSql, expected) => {
    psql(breakSql, `break: ${label}`);
    const failing = verificationRows().filter((row) => row[2] !== 't').map((row) => row[1]);
    psql(restoreSql, `restore: ${label}`);
    check(`verification: detects ${label}`, failing.some((name) => name.includes(expected)), failing.join('; ') || 'nothing reported');
  };
  detects('a disabled organization guard', 'alter table organizations disable trigger trg_guard_organization_billing_columns;', 'alter table organizations enable trigger trg_guard_organization_billing_columns;', 'guard trigger is installed, enabled');
  detects('a disabled seat guard', 'alter table organization_members disable trigger trg_guard_organization_member_seats;', 'alter table organization_members enable trigger trg_guard_organization_member_seats;', 'seat guard trigger is installed');
  detects('platform_admins reopened to clients', 'grant select on platform_admins to authenticated;', 'revoke select on platform_admins from authenticated;', 'platform_admins: anon and authenticated hold no privilege');
  detects('seat purchases callable by clients', 'grant execute on function pawos_apply_seat_purchase(text, text, uuid, uuid, text, integer) to authenticated;', 'revoke execute on function pawos_apply_seat_purchase(text, text, uuid, uuid, text, integer) from authenticated;', 'only the service role can add paid seats');
  detects('a ledger function running with owner rights again', 'alter function mark_external_write_completed(uuid, text) security definer;', 'alter function mark_external_write_completed(uuid, text) security invoker;', 'external-write functions run as the caller');
  detects('a privileged function without a fixed search_path', 'alter function is_org_member(uuid, uuid) reset search_path;', 'alter function is_org_member(uuid, uuid) set search_path = public;', 'fixed search_path');
  detects('row level security switched off', 'alter table user_entitlements disable row level security;', 'alter table user_entitlements enable row level security;', 'on for user_entitlements');
  detects('a wallet function reopened to signed-in users', 'grant execute on function add_ticket_balance(uuid, numeric, text) to authenticated;', 'revoke execute on function add_ticket_balance(uuid, numeric, text) from authenticated;', 'old wallet functions are not executable');
  detects('the owner-role rule removed', 'alter table organization_members disable trigger trg_guard_organization_member_delete;', 'alter table organization_members enable trigger trg_guard_organization_member_delete;', 'grant the owner role');
  detects('the usage guard switched off', 'alter table organizations disable trigger trg_guard_organization_api_usage;', 'alter table organizations enable trigger trg_guard_organization_api_usage;', 'recorded Enterprise API usage cannot be lowered');
  check('verification: passes again once everything is restored', verificationRows().every((row) => row[2] === 't'));

  console.log(`\n${results.join('\n')}`);
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
} catch (error) {
  failed++;
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (started) spawnSync(exe('pg_ctl'), ['-D', dataDir, '-m', 'immediate', 'stop'], { env, stdio: 'ignore' });
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
