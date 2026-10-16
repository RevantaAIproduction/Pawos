// Image generation database tests — LOCAL THROWAWAY CLUSTER ONLY.
//
// Creates a brand-new PostgreSQL cluster in a temp folder, applies the Supabase stand-ins, the usage
// bucket migrations it builds on, and 20261015000000_image_generation.sql (twice — it must be safe to
// re-run), then runs scenarios.sql and a two-session race for the last free image. Prints every
// result, stops and deletes the cluster. It never connects to Supabase or to any existing database.
//
//   node supabase/tests/image_generation/run.mjs
//
// PG_BIN (default: C:/Program Files/PostgreSQL/18/bin) and PG_TEST_PORT (default 55471) can be set.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const migrations = path.join(repo, 'supabase', 'migrations');
const pgBin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const port = String(process.env.PG_TEST_PORT ?? 55471);
const exe = (name) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-image-generation-'));
const conn = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-X'];
const env = { ...process.env, PGCLIENTENCODING: 'UTF8' };

const BUILDS_ON = [
  '20260917000000_usage_credits_and_referral_cleanup.sql',
  '20260925060000_pawos_subscriptions.sql',
  '20260925080000_usage_credits_precision.sql',
  '20260925090000_lock_credit_minting.sql',
  '20260926000000_pawos_subscriptions_billing_frequency.sql',
  '20261001000000_usage_buckets.sql',
];
const UNDER_TEST = '20261015000000_image_generation.sql';
const RECOVERY = '20261016000000_image_generation_recovery.sql';

function run(cmd, args, label, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', env, ...opts });
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`);
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
  run(exe('pg_ctl'), ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-l', path.join(dataDir, 'server.log'), '-w', 'start'], 'pg_ctl start', { stdio: 'ignore' });
  started = true;

  psqlFile(path.join(repo, 'supabase', 'tests', 'usage_buckets', 'bootstrap.sql'));
  for (const file of BUILDS_ON) psqlFile(path.join(migrations, file));
  // Stand-ins for the organization tables the migration references (their own migrations are not under test).
  psqlQuery(`create table if not exists public.organizations (id uuid primary key, tier text not null);
             create table if not exists public.organization_members (organization_id uuid not null references public.organizations(id), user_id uuid, seat_tier text, status text not null default 'active', primary key (organization_id, user_id));`);
  psqlFile(path.join(migrations, UNDER_TEST));
  psqlFile(path.join(migrations, UNDER_TEST)); // safe to run twice
  psqlFile(path.join(migrations, RECOVERY));
  psqlFile(path.join(migrations, RECOVERY)); // safe to run twice

  // The test helpers (the same ones the usage bucket scenarios use).
  psqlQuery(`create schema t;
    create table t.results (seq serial, name text, ok boolean, detail text);
    create function t.check(p_name text, p_ok boolean, p_detail text default '') returns void language plpgsql as $$
    begin insert into t.results (name, ok, detail) values (p_name, coalesce(p_ok, false), coalesce(p_detail, '')); end $$;
    grant usage on schema t to authenticated;
    grant insert on t.results to authenticated;
    grant usage on sequence t.results_seq_seq to authenticated;
    create function t.as_user(p_uid uuid) returns void language sql as $$
      select set_config('request.jwt.claim.sub', p_uid::text, false), set_config('request.jwt.claim.role', 'authenticated', false); $$;
    create function t.as_service() returns void language sql as $$
      select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false); $$;
    create function t.invariants_hold() returns boolean language sql as $$
      select not exists (select 1 from public.usage_buckets where consumed_micro_usd < 0 or reserved_micro_usd < 0 or consumed_micro_usd + reserved_micro_usd > private_allowance_micro_usd); $$;`);

  psqlFile(path.join(here, 'scenarios.sql'));
  psqlFile(path.join(here, 'recovery.sql'));

  // Race: an account with one free image left, two requests at once. Session A holds its transaction
  // open for 2 s after starting its generation; session B starts 0.5 s later and must wait for A,
  // then find no free image left — never two free images from the last one.
  const RACER = 'f7f7f7f7-f7f7-4f7f-8f7f-f7f7f7f7f7f7';
  psqlQuery(`select set_config('request.jwt.claim.role', 'service_role', false);
    select public.begin_image_generation('${RACER}', 'race-pre-1', 'gemini-3.1-flash-lite-image', '1:1', '1K', 'free_then_credits', null);
    select public.complete_image_generation('${RACER}', (select id from public.generated_images where request_key = 'race-pre-1'), 'image/png', 10, '${RACER}/a.png', 1, 1);
    select public.begin_image_generation('${RACER}', 'race-pre-2', 'gemini-3.1-flash-lite-image', '1:1', '1K', 'free_then_credits', null);
    select public.complete_image_generation('${RACER}', (select id from public.generated_images where request_key = 'race-pre-2'), 'image/png', 10, '${RACER}/b.png', 1, 1);`);
  const service = `select set_config('request.jwt.claim.role', 'service_role', false);`;
  const begin = (key) => `select public.begin_image_generation('${RACER}', '${key}', 'gemini-3.1-flash-lite-image', '1:1', '1K', 'free_then_credits', null)->>'ok';`;
  const sessionA = psqlAsync(`${service} begin; ${begin('race-a')} select pg_sleep(2); commit;`);
  await new Promise((r) => setTimeout(r, 500));
  const sessionB = psqlAsync(`${service} ${begin('race-b')}`);
  const [a, b] = await Promise.all([sessionA, sessionB]);
  const okA = a.out.split('\n').includes('true');
  const okB = b.out.split('\n').includes('true');
  const freeRows = Number(psqlQuery(`select count(*) from public.generated_images where user_id = '${RACER}' and funding = 'free'`));
  const record = (name, ok, detail = '') => psqlQuery(`insert into t.results (name, ok, detail) values ($q$${name}$q$, ${ok}, $q$${detail}$q$)`);
  record('Race: two requests for the last free image — exactly one gets it', okA !== okB, `A=${okA} B=${okB} ${a.err} ${b.err}`);
  record('Race: the account never has more than 3 free images', freeRows === 3, `free rows ${freeRows}`);
  record('Race: neither request errored (the second waited, then was cleanly refused)', a.code === 0 && b.code === 0, `${a.err} ${b.err}`);

  // Lease races (recovery.sql's account a5): the server's complete and recovery both take the
  // generation's row lock, so whichever comes second sees the first one's result.
  const RACE2 = 'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5';
  // Details go into one result line: no line breaks or '|' (the report splits on both).
  const one = (text) => String(text).replace(/[\r\n|]+/g, ' ').trim();
  const beginRace = (key) => psqlQuery(`${service} select (public.begin_image_generation('${RACE2}', '${key}', 'gemini-3.1-flash-lite-image', '1:1', '1K', 'buckets', null)->'image'->>'id');`).split('\n').pop();
  const consumed = () => Number(psqlQuery(`select consumed_micro_usd from public.usage_buckets where user_id = '${RACE2}' and source_type = 'monthly_plan'`));
  const complete = (id) => `select public.complete_image_generation('${RACE2}', '${id}', 'image/png', 1500000, '${RACE2}/${id}.png', 20, 1120)->>'ok';`;

  // (1) The server completes 3 s before its lease ends and holds the lock 5 s; recovery arrives once
  //     the lease has ended, waits, and finds it completed — charged once, not released.
  const id1 = beginRace('lease-race-1');
  psqlQuery(`update public.generated_images set created_at = now() - public.pawos_image_lease() + interval '3 seconds' where id = '${id1}'`);
  const before1 = consumed();
  const server1 = psqlAsync(`${service} begin; ${complete(id1)} select pg_sleep(5); commit;`);
  await new Promise((r) => setTimeout(r, 3500));
  const recovery1 = psqlAsync(`select public.pawos_recover_image_generation('${id1}');`);
  const [s1, r1] = await Promise.all([server1, recovery1]);
  record('Lease race: a completion just inside the lease wins; recovery then finds it settled', s1.out.split('\n').includes('true') && r1.out === 'settled', one(`server=${s1.out} recovery=${r1.out} ${s1.err} ${r1.err}`));
  record('Lease race: charged exactly once', consumed() === before1 + 48500, `consumed ${before1} -> ${consumed()}`);

  // (2) Recovery fails a generation past its lease while holding the lock; the late server's
  //     complete waits, then is refused — nothing charged, the hold released.
  const id2 = beginRace('lease-race-2');
  psqlQuery(`update public.generated_images set created_at = now() - interval '6 minutes' where id = '${id2}'`);
  const before2 = consumed();
  const recovery2 = psqlAsync(`begin; select public.pawos_recover_image_generation('${id2}'); select pg_sleep(2); commit;`);
  await new Promise((r) => setTimeout(r, 500));
  const server2 = psqlAsync(`${service} ${complete(id2)}`);
  const [r2, s2] = await Promise.all([recovery2, server2]);
  const state2 = psqlQuery(`select g.status || '|' || r.state from public.generated_images g join public.usage_bucket_reservations r on r.id = g.reservation_id where g.id = '${id2}'`);
  record('Lease race: recovery wins past the lease; the late completion is refused', r2.out.split('\n').includes('abandoned') && s2.out.split('\n').includes('false') && state2 === 'failed|released', one(`recovery=${r2.out} server=${s2.out} state=${state2} ${r2.err} ${s2.err}`));
  record('Lease race: nothing charged for it', consumed() === before2, `consumed ${before2} -> ${consumed()}`);
  // (3) The original request and a retry that found its stored image complete it at the same time:
  //     both are told it succeeded; it is charged once.
  const id3 = beginRace('lease-race-3');
  const before3 = consumed();
  const owner3 = psqlAsync(`${service} begin; ${complete(id3)} select pg_sleep(2); commit;`);
  await new Promise((r) => setTimeout(r, 500));
  const retry3 = psqlAsync(`${service} ${complete(id3)}`);
  const [o3, r3] = await Promise.all([owner3, retry3]);
  record('Completion race: the owner and a retry both completing — both told it succeeded', o3.out.split('\n').includes('true') && r3.out.split('\n').includes('true'), one(`owner=${o3.out} retry=${r3.out} ${o3.err} ${r3.err}`));
  record('Completion race: charged exactly once', consumed() === before3 + 48500 && psqlQuery(`select count(*) from public.usage_bucket_events where usage_event_id = 'image:${id3}'`) === '1', `consumed ${before3} -> ${consumed()}`);
  record('Lease races: bucket invariants hold', psqlQuery('select t.invariants_hold()') === 't');

  // Rollback (rollback_20261016.sql), then re-apply. Account a1 (recovery.sql's Pro account).
  const PRO = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  const beginPro = (key) => psqlQuery(`${service} select (public.begin_image_generation('${PRO}', '${key}', 'gemini-3.1-flash-lite-image', '1:1', '1K', 'buckets', null)->'image'->>'id');`).split('\n').pop();
  const completePro = (id) => psqlQuery(`${service} select public.complete_image_generation('${PRO}', '${id}', 'image/png', 1500000, '${PRO}/${id}.png', 20, 1120)->>'ok';`).split('\n').pop();
  const age = (id, minutes) => psqlQuery(`update public.generated_images set created_at = now() - interval '${minutes} minutes' where id = '${id}'`);
  const recoveryFunctions = () => Number(psqlQuery(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('pawos_image_lease', 'pawos_fail_image_generation', 'pawos_recover_image_generation', 'pawos_recover_image_generations', 'pawos_recover_organization_image_generations', 'recover_stale_image_generations')`));

  const abandoned = beginPro('rollback-abandoned');
  age(abandoned, 11);
  psqlQuery(`update public.usage_bucket_reservations set expires_at = now() - interval '1 second' where id = (select reservation_id from public.generated_images where id = '${abandoned}')`);
  psqlFile(path.join(here, 'rollback_20261016.sql'));
  record('Rollback: every function 20261016 added is gone', recoveryFunctions() === 0, `left ${recoveryFunctions()}`);
  psqlQuery(`select public.pawos_bucket_housekeeping('${PRO}')`);
  const holdAfterRollback = psqlQuery(`select r.state from public.usage_bucket_reservations r join public.generated_images g on g.reservation_id = r.id where g.id = '${abandoned}'`);
  record('Rollback: the old housekeeping is back — an abandoned image hold is timeout-charged again', holdAfterRollback === 'expired_settled', holdAfterRollback);
  const late = beginPro('rollback-late');
  age(late, 6);
  record('Rollback: the old completion is back — no lease', completePro(late) === 'true');
  record('Rollback: bucket invariants hold', psqlQuery('select t.invariants_hold()') === 't');

  psqlFile(path.join(migrations, RECOVERY));
  record('Re-apply: 20261016 applies cleanly after a rollback', recoveryFunctions() === 6, `functions ${recoveryFunctions()}`);
  const lateAgain = beginPro('reapplied-late');
  age(lateAgain, 6);
  record('Re-apply: the lease is enforced again', completePro(lateAgain) === 'false');
  record('Re-apply: bucket invariants hold', psqlQuery('select t.invariants_hold()') === 't');

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
