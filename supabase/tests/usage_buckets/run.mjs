// Usage bucket database tests — LOCAL THROWAWAY CLUSTER ONLY.
//
// Creates a brand-new PostgreSQL cluster in a temp folder (trust auth, its own port), applies the
// Supabase stand-ins, the real prerequisite migrations and 20261001000000_usage_buckets.sql, runs
// tests.sql plus a two-session concurrency race, prints every result, then stops and deletes the
// cluster. It never connects to Supabase or to any existing database.
//
//   node supabase/tests/usage_buckets/run.mjs
//
// PG_BIN (default: C:/Program Files/PostgreSQL/18/bin) and PG_TEST_PORT (default 55432) can be set.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const migrations = path.join(repo, 'supabase', 'migrations');
const pgBin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const port = String(process.env.PG_TEST_PORT ?? 55432);
const exe = (name) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-usage-buckets-'));
const conn = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-X'];

const PREREQUISITES = [
  '20260917000000_usage_credits_and_referral_cleanup.sql',
  '20260925060000_pawos_subscriptions.sql',
  '20260925080000_usage_credits_precision.sql',
  '20260925090000_lock_credit_minting.sql',
  '20260926000000_pawos_subscriptions_billing_frequency.sql',
];
const UNDER_TEST = '20261001000000_usage_buckets.sql';

// SQL always goes to psql over stdin as UTF-8 (Windows command-line arguments are not UTF-8).
const env = { ...process.env, PGCLIENTENCODING: 'UTF8' };

function run(cmd, args, label, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', env, ...opts });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}
const psqlFile = (file) => run(exe('psql'), [...conn, '-f', file], `psql ${path.basename(file)}`);
const psqlQuery = (sql) => run(exe('psql'), [...conn, '-t', '-A'], 'psql query', { input: sql }).trim();

function psqlAsync(sql) {
  return new Promise((resolve) => {
    const child = spawn(exe('psql'), [...conn, '-t', '-A'], { env });
    child.stdin.end(sql);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

let started = false;
let failed = 0;
try {
  run(exe('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'], 'initdb');
  // stdio 'ignore': the server inherits pg_ctl's handles, so piped output would never close.
  run(exe('pg_ctl'), ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-l', path.join(dataDir, 'server.log'), '-w', 'start'], 'pg_ctl start', { stdio: 'ignore' });
  started = true;

  psqlFile(path.join(here, 'bootstrap.sql'));
  for (const file of PREREQUISITES) psqlFile(path.join(migrations, file));

  // The read-only production pre-flight, against the pre-migration schema with one $10 wallet
  // (production's state). Every check must pass, and it must change nothing.
  psqlQuery(`insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'preflight@test');
             insert into public.user_usage_credits (user_id, balance_usd) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10.000000);`);
  const preflight = run(exe('psql'), [...conn, '-t', '-A', '-F', '|', '-f', path.join(here, 'production_preflight.sql')], 'production pre-flight');
  console.log(`Production pre-flight (pre-migration schema, one $10 wallet):\n${preflight.trim()}\n`);
  const preflightFailures = preflight.split('\n').filter((line) => /\|f\|/.test(line));
  if (preflightFailures.length > 0) throw new Error(`Pre-flight checks failed:\n${preflightFailures.join('\n')}`);
  psqlQuery(`delete from public.user_usage_credits where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
             delete from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';`);

  // Phase 2 as it will run in production, against a production-like state: the one $10 wallet, a paid
  // subscription, and stand-ins (with rows) for the autonomous / Ticket Balance and Team/Enterprise
  // objects the migration must not touch. Snapshot → transaction-wrapped apply → snapshot → verify.
  psqlQuery(`insert into auth.users (id, email) values ('446eeaeb-585d-4f9a-a1dc-baa95ce54326', 'legacy-holder@test');
             insert into public.user_usage_credits (user_id, balance_usd) values ('446eeaeb-585d-4f9a-a1dc-baa95ce54326', 10.000000);
             insert into public.pawos_subscriptions (id, user_id, tier, status, current_period_end, source, billing_frequency)
               values ('sub_prod_like', '446eeaeb-585d-4f9a-a1dc-baa95ce54326', 'pro', 'active', now() + interval '20 days', 'test', 'monthly');
             create table public.user_task_credits (user_id uuid primary key, balance_usd numeric(12,2) not null default 0, reserved_usd numeric(12,2) not null default 0);
             create table public.organization_task_credits (organization_id uuid primary key, balance_usd numeric(12,2) not null default 0, reserved_usd numeric(12,2) not null default 0);
             create table public.ticket_balance_topups (id serial primary key, amount_usd numeric);
             create table public.autonomous_task_runs (id uuid primary key default gen_random_uuid(), status text);
             create table public.organization_usage_counters (organization_id uuid, used numeric);
             create function public.reserve_autonomous_pc() returns void language sql as $$ select $$;
             create function public.settle_autonomous_task_run_pc() returns void language sql as $$ select $$;
             create function public.mark_autonomous_task_completed() returns void language sql as $$ select $$;
             create function public.record_enterprise_api_usage(uuid, numeric) returns void language sql as $$ select $$;
             insert into public.user_task_credits values ('446eeaeb-585d-4f9a-a1dc-baa95ce54326', 40, 5);
             insert into public.organization_task_credits values (gen_random_uuid(), 100, 0);
             insert into public.ticket_balance_topups (amount_usd) values (40), (60);
             insert into public.autonomous_task_runs (status) values ('completed');
             insert into public.organization_usage_counters values (gen_random_uuid(), 1234);`);
  const snapshotArgs = [...conn, '-t', '-A', '-F', '|', '-f', path.join(here, 'phase2_snapshot.sql')];
  const before = run(exe('psql'), snapshotArgs, 'phase 2 snapshot (before)').trim().split('\n');
  psqlFile(path.join(here, 'phase2_apply_usage_buckets.sql'));
  const after = run(exe('psql'), snapshotArgs, 'phase 2 snapshot (after)').trim().split('\n');
  const verify = run(exe('psql'), [...conn, '-t', '-A', '-F', '|', '-f', path.join(here, 'phase2_verify.sql')], 'phase 2 verification');
  console.log(`Phase 2 verification (local production-like copy):\n${verify.trim()}\n`);
  const verifyFailures = verify.split('\n').filter((line) => /\|f\|/.test(line));
  if (verifyFailures.length > 0) throw new Error(`Phase 2 verification failed:\n${verifyFailures.join('\n')}`);
  if (!/^14\|.*record_enterprise_api_usage=true, organization_usage_counters=true/m.test(verify)) throw new Error('Check 14 did not detect the Team/Enterprise objects');
  const changed = before.map((line, i) => [line, after[i]]).filter(([b, a]) => b !== a);
  console.log(`Phase 2 snapshot — rows that changed:\n${changed.map(([b, a]) => `  before: ${b}\n  after:  ${a}`).join('\n')}\n`);
  const changedItems = changed.map(([b]) => b.split('|')[0]).sort();
  if (JSON.stringify(changedItems) !== JSON.stringify(['public_functions', 'public_tables'])) {
    throw new Error(`Snapshot rows other than the table/function counts changed: ${changedItems.join(', ')}`);
  }
  const delta = (item) => Number(after.find((l) => l.startsWith(`${item}|`)).split('|')[1]) - Number(before.find((l) => l.startsWith(`${item}|`)).split('|')[1]);
  console.log(`Phase 2 snapshot deltas: tables +${delta('public_tables')}, functions +${delta('public_functions')}\n`);

  // Absence is reported as absence: without the stand-ins, check 13 must read false.
  psqlQuery(`drop function public.reserve_autonomous_pc(); drop function public.settle_autonomous_task_run_pc();
             drop function public.mark_autonomous_task_completed(); drop function public.record_enterprise_api_usage(uuid, numeric);
             drop table public.user_task_credits, public.organization_task_credits, public.ticket_balance_topups,
               public.autonomous_task_runs, public.organization_usage_counters;`);
  const verifyAbsent = run(exe('psql'), [...conn, '-t', '-A', '-F', '|', '-f', path.join(here, 'phase2_verify.sql')], 'phase 2 verification (objects absent)');
  if (!/^13\|[^|]*\|f\|/m.test(verifyAbsent)) throw new Error('Check 13 did not report missing autonomous objects');
  if (!/^14\|.*record_enterprise_api_usage=false, organization_usage_counters=false/m.test(verifyAbsent)) throw new Error('Check 14 did not report missing Team/Enterprise objects');
  console.log('Phase 2 verification with the autonomous / Team-Enterprise objects removed: check 13 = false, check 14 reports both absent (as intended).\n');
  // Phase 3 dry run as it will run in production (still the production-like state after Phase 2).
  const dryRun = run(exe('psql'), [...conn, '-x', '-f', path.join(here, 'phase3_dry_run.sql')], 'phase 3 dry run');
  console.log(`Phase 3 dry run (local production-like copy):\n${dryRun.trim()}\n`);
  const field = (name) => (dryRun.match(new RegExp(`^${name}\\s*\\|\\s*(.*)$`, 'm')) ?? [])[1]?.trim();
  const expected = {
    dry_run: 'true', wallets_reported: '1', would_migrate: '1', user_id: '446eeaeb-585d-4f9a-a1dc-baa95ce54326',
    customer_value_cents: '1000', customer_pc: '1000', private_allowance_micro_usd: '7000000', expiry: 'never',
    bucket_key: 'legacy:user_usage_credits:446eeaeb-585d-4f9a-a1dc-baa95ce54326', after_buckets: '0', after_legacy_buckets: '0',
    after_legacy_balance: '10.000000', after_not_migrated: 't', after_migration_audit_rows: '0', after_usage_rows: '0',
  };
  const mismatches = Object.entries(expected).filter(([k, v]) => field(k) !== v).map(([k, v]) => `${k}: expected ${v}, got ${field(k)}`);
  if (mismatches.length > 0) throw new Error(`Phase 3 dry run mismatch:\n${mismatches.join('\n')}`);
  console.log('Phase 3 dry run matched every expected value.\n');

  // Phase 4 as it will run in production: snapshot → migrate once → snapshot → read-only verification.
  const snap4Before = run(exe('psql'), snapshotArgs, 'phase 4 snapshot (before)').trim().split('\n');
  const migrated = run(exe('psql'), [...conn, '-t', '-A', '-f', path.join(here, 'phase4_migrate.sql')], 'phase 4 migrate').trim();
  console.log(`Phase 4 migration result (local production-like copy):\n${migrated}\n`);
  const snap4After = run(exe('psql'), snapshotArgs, 'phase 4 snapshot (after)').trim().split('\n');
  const verifyArgs4 = [...conn, '-t', '-A', '-F', '|', '-f', path.join(here, 'phase4_verify.sql')];
  const verify4 = run(exe('psql'), verifyArgs4, 'phase 4 verification');
  console.log(`Phase 4 verification:\n${verify4.trim()}\n`);
  const fail4 = verify4.split('\n').filter((line) => /^\d+\|[^|]*\|f\|/.test(line));
  if (fail4.length > 0) throw new Error(`Phase 4 verification failed:\n${fail4.join('\n')}`);
  const changed4 = snap4Before.map((line, i) => [line, snap4After[i]]).filter(([b, a]) => b !== a).map(([b]) => b.split('|')[0]);
  console.log(`Phase 4 snapshot rows that changed: ${changed4.join(', ') || '(none)'}\n`);
  // (Item names contain "|", so the split above keeps only their first part, e.g. "user_usage_credits (count ".)
  if (changed4.length !== 1 || !changed4[0].startsWith('user_usage_credits')) {
    throw new Error(`Phase 4 changed more than the legacy wallet row: ${changed4.join(', ')}`);
  }
  // Locally only: run the REAL migration a second time to prove it is idempotent, then re-verify.
  const again = run(exe('psql'), [...conn, '-t', '-A', '-f', path.join(here, 'phase4_migrate.sql')], 'phase 4 migrate (second run, local only)').trim();
  const verify4Again = run(exe('psql'), verifyArgs4, 'phase 4 verification (after second run)');
  if (!again.includes('"already_migrated"') || /^\d+\|[^|]*\|f\|/m.test(verify4Again)) {
    throw new Error(`Second real run was not idempotent:\n${again}\n${verify4Again}`);
  }
  console.log(`Phase 4 second real run (local only): ${again}\nPhase 4 verification still all true after the second run.\n`);

  psqlQuery(`delete from public.pawos_subscriptions where id = 'sub_prod_like';
             delete from public.user_usage_credits where user_id = '446eeaeb-585d-4f9a-a1dc-baa95ce54326';
             delete from auth.users where id = '446eeaeb-585d-4f9a-a1dc-baa95ce54326';`);
  // Migration validation: applying it a second time must also succeed (idempotent DDL).
  psqlFile(path.join(migrations, UNDER_TEST));

  psqlFile(path.join(here, 'tests.sql'));

  // R: two simultaneous reservations against a bucket that can fund only one. Session A holds its
  // transaction open for 2 s after reserving; session B starts 0.5 s later and must wait, then see
  // A's hold and be denied — never both succeed.
  const user = '88888888-8888-8888-8888-888888888888';
  const claims = `select set_config('request.jwt.claim.sub', '${user}', false), set_config('request.jwt.claim.role', 'authenticated', false);`;
  const reserve = (key) => `select public.reserve_usage('${key}', 'gemini-3.1-pro-preview', 100000, false, 8000, 'chat', 'standard')->>'ok';`;
  const sessionA = psqlAsync(`${claims} begin; ${reserve('race-a')} select pg_sleep(2); commit;`);
  await new Promise((r) => setTimeout(r, 500));
  const sessionB = psqlAsync(`${claims} ${reserve('race-b')}`);
  const [a, b] = await Promise.all([sessionA, sessionB]);
  const okA = a.out.split('\n').includes('true');
  const okB = b.out.split('\n').includes('true');
  const held = Number(psqlQuery(`select reserved_micro_usd from public.usage_buckets where purchase_ref = 'pay:pay_conc'`));
  const allowance = Number(psqlQuery(`select private_allowance_micro_usd from public.usage_buckets where purchase_ref = 'pay:pay_conc'`));
  const record = (name, ok, detail = '') =>
    psqlQuery(`insert into t.results (name, ok, detail) values ($q$${name}$q$, ${ok}, $q$${detail}$q$)`);
  record('R: two simultaneous reservations — exactly one succeeds', okA !== okB, `A=${okA} B=${okB} ${a.err} ${b.err}`);
  record('R: the bucket is never overspent by concurrent reservations', held > 0 && held <= allowance, `held=${held} allowance=${allowance}`);
  record('R: no reservation errored (the second waited, then was cleanly denied)', a.code === 0 && b.code === 0, `${a.err} ${b.err}`);

  // The production dry-run script must run cleanly (and change nothing — it rolls back).
  // Fixture mirroring production: one unmigrated $10.00 wallet.
  psqlQuery(`insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'prod-like@test');
             insert into public.user_usage_credits (user_id, balance_usd) values ('99999999-9999-9999-9999-999999999999', 10.000000);`);
  const bucketsBefore = psqlQuery(`select count(*) from public.usage_buckets`);
  const dryRunOutput = run(exe('psql'), [...conn, '-t', '-A', '-f', path.join(here, 'legacy_migration_dry_run.sql')], 'legacy dry run');
  const bucketsAfter = psqlQuery(`select count(*) from public.usage_buckets`);
  const walletAfter = psqlQuery(`select balance_usd || '|' || coalesce(migrated_at::text, 'not migrated') from public.user_usage_credits where user_id = '99999999-9999-9999-9999-999999999999'`);
  console.log(`Legacy dry-run output:\n${dryRunOutput.trim()}\n`);
  record('Legacy dry-run script runs cleanly and changes nothing',
    bucketsBefore === bucketsAfter && walletAfter === '10.000000|not migrated', `${bucketsBefore} → ${bucketsAfter}; wallet ${walletAfter}`);
  record('Legacy dry run reports the $10 wallet as $10 / 1,000 PC / $7 private',
    dryRunOutput.includes('"customerValueCents": 1000') && dryRunOutput.includes('"privateAllowanceMicroUsd": 7000000') && dryRunOutput.includes('would_migrate'),
    dryRunOutput.slice(0, 300).replace(/\s+/g, ' '));

  const rows = psqlQuery(`select ok || '|' || name || '|' || coalesce(detail, '') from t.results order by seq`).split('\n').filter(Boolean);
  for (const row of rows) {
    const [ok, name, ...detail] = row.split('|');
    const pass = ok === 'true';
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail.join('|') ? `  — ${detail.join('|')}` : ''}`);
  }
  console.log(`\n${rows.length - failed} passed, ${failed} failed (${rows.length} checks)`);
} catch (error) {
  failed++;
  console.error(String(error instanceof Error ? error.message : error));
} finally {
  if (started) spawnSync(exe('pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed > 0 ? 1 : 0);
