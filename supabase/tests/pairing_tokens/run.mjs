// Pairing token database tests — LOCAL THROWAWAY CLUSTER ONLY.
//
// Creates a brand-new PostgreSQL cluster in a temp folder, applies the Supabase stand-ins and the
// real mobile-pairing migrations, then plays signed-in accounts calling the pairing functions the
// way a request with the public key arrives (as the `authenticated` role). It checks that a pairing
// token expires, cannot be used twice, is bound to the account that made it, and is stored only as
// a hash — first as the functions stand, then with 20261011000000_security_pairing_expiry_cap.sql.
// Stops and deletes the cluster afterwards. It never connects to Supabase.
//
//   node supabase/tests/pairing_tokens/run.mjs
//
// PG_BIN (default: C:/Program Files/PostgreSQL/18/bin) and PG_TEST_PORT (default 55434) can be set.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const migrations = path.join(repo, 'supabase', 'migrations');
const pgBin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const port = String(process.env.PG_TEST_PORT ?? 55434);
const exe = (name) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-pairing-tokens-'));
const conn = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-X', '-t', '-A'];
const env = { ...process.env, PGCLIENTENCODING: 'UTF8' };

function psql(sql, { allowFail = false } = {}) {
  // Given on standard input, so psql's own commands (\gset) work as they do in a script.
  const result = spawnSync(exe('psql'), [...conn, '-f', '-'], { encoding: 'utf8', env, input: `${sql}
` });
  if (result.status !== 0 && !allowFail) throw new Error(`psql failed:\n${sql}\n${result.stderr}`);
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}
const psqlFile = (file) => {
  const result = spawnSync(exe('psql'), [...conn, '-f', file], { encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed:\n${result.stderr}`);
};
/** Runs SQL as a signed-in account: the `authenticated` role with that account's id in the token. */
const asUser = (user, sql) =>
  psql(`begin; select set_config('request.jwt.claim.sub', '${user}', true), set_config('request.jwt.claim.role', 'authenticated', true) \\gset ignored_\n set local role authenticated; ${sql}; commit;`, { allowFail: true });
const asAnonymous = (sql) => psql(`begin; select set_config('request.jwt.claim.role', 'anon', true) \\gset ignored_\n set local role anon; ${sql}; commit;`, { allowFail: true });

const PRO = '11111111-1111-4111-8111-111111111111';
const OTHER_PRO = '22222222-2222-4222-8222-222222222222';
const GO = '33333333-3333-4333-8333-333333333333';

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
}

/** Starts a pairing session for an account; answers { id, token, seconds } or null when refused. */
function begin(user, argument = '') {
  const result = asUser(user, `select session_id || '|' || token || '|' || round(extract(epoch from (expires_at - now()))) from begin_pairing_session(${argument})`);
  if (!result.ok) {
    if (process.env.PAIRING_TEST_DEBUG) console.log(`begin refused: ${result.err}`);
    return { refused: result.err };
  }
  const [id, token, seconds] = result.out.split('\n').pop().split('|');
  return { id, token, seconds: Number(seconds) };
}
const complete = (user, token) => asUser(user, `select complete_pairing_session('${token}', 'Test phone')`);
const statusOf = (id) => psql(`select status from pairing_sessions where id = '${id}'`).out;
const devicesOf = (user) => Number(psql(`select count(*) from trusted_devices where user_id = '${user}'`).out);

function scenarios(label) {
  // --- who may begin
  check(`${label}: a signed-out caller cannot begin pairing`, !asAnonymous(`select * from begin_pairing_session()`).ok);
  check(`${label}: a Paw Go account cannot begin pairing`, /requires Paw Pro/.test(begin(GO).refused ?? ''));

  // --- the token itself
  const first = begin(PRO);
  check(`${label}: a paid account gets a session and a token`, Boolean(first.id) && /^[0-9a-f]{48}$/.test(first.token ?? ''));
  check(`${label}: the default lifetime is five minutes`, first.seconds >= 295 && first.seconds <= 300, `got ${first.seconds}s`);
  const stored = psql(`select token_hash from pairing_sessions where id = '${first.id}'`).out;
  check(`${label}: only a hash of the token is stored`, stored !== first.token && stored.length === 64 && !psql(`select count(*) from pairing_sessions where token_hash = '${first.token}'`).out.includes('1'));
  check(`${label}: two sessions never share a token`, begin(PRO).token !== first.token);
  check(`${label}: another account cannot read the session`, asUser(OTHER_PRO, `select count(*) from pairing_sessions where id = '${first.id}'`).out.split('\n').pop() === '0');

  // --- completing
  check(`${label}: a wrong token is refused`, /invalid or already-used/.test(complete(PRO, 'f'.repeat(48)).err));
  check(`${label}: a signed-out caller cannot complete pairing`, !asAnonymous(`select complete_pairing_session('${first.token}', 'x')`).ok);
  const stolen = complete(OTHER_PRO, first.token);
  check(`${label}: the token is bound to its account — someone else holding it cannot pair`, /invalid or already-used/.test(stolen.err) && devicesOf(OTHER_PRO) === 0 && statusOf(first.id) === 'pending');
  const before = devicesOf(PRO);
  const done = complete(PRO, first.token);
  check(`${label}: the right account with the right token pairs one device`, done.ok && devicesOf(PRO) === before + 1 && statusOf(first.id) === 'completed');

  // --- token reuse
  const again = complete(PRO, first.token);
  check(`${label}: token reuse is refused`, !again.ok && /invalid or already-used/.test(again.err));
  check(`${label}: reuse pairs no second device`, devicesOf(PRO) === before + 1);
  check(`${label}: reuse by another account is refused too`, !complete(OTHER_PRO, first.token).ok && devicesOf(OTHER_PRO) === 0);

  // --- token expiry
  const late = begin(PRO);
  psql(`update pairing_sessions set expires_at = now() - interval '1 second' where id = '${late.id}'`);
  const expired = complete(PRO, late.token);
  check(`${label}: an expired token is refused`, !expired.ok && /expired/.test(expired.err));
  check(`${label}: an expired token pairs no device`, devicesOf(PRO) === before + 1);
  check(`${label}: an expired token stays unusable`, !complete(PRO, late.token).ok && statusOf(late.id) !== 'completed');
  const edge = begin(PRO);
  psql(`update pairing_sessions set expires_at = now() + interval '30 seconds' where id = '${edge.id}'`);
  check(`${label}: a token inside its lifetime still works`, complete(PRO, edge.token).ok);

  // --- a client cannot alter a session directly
  const direct = begin(PRO);
  asUser(PRO, `update pairing_sessions set expires_at = now() + interval '10 years', status = 'pending' where id = '${direct.id}'`);
  const lifetime = Number(psql(`select round(extract(epoch from (expires_at - now()))) from pairing_sessions where id = '${direct.id}'`).out);
  check(`${label}: an account cannot extend its own session by writing to the table`, lifetime <= 300, `lifetime is now ${lifetime}s`);
  asUser(PRO, `update pairing_sessions set status = 'pending' where id = '${first.id}'`);
  check(`${label}: an account cannot reopen a used session by writing to the table`, statusOf(first.id) === 'completed');
}

try {
  const init = spawnSync(exe('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'], { encoding: 'utf8', env });
  if (init.status !== 0) throw new Error(`initdb failed:\n${init.stderr}`);
  const start = spawnSync(exe('pg_ctl'), ['-D', dataDir, '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-l', path.join(dataDir, 'server.log'), '-w', 'start'], { env, stdio: 'ignore' });
  if (start.status !== 0) throw new Error('pg_ctl start failed');

  psqlFile(path.join(repo, 'supabase', 'tests', 'web_tier', 'local_stub.sql'));
  psql(`alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
  psql(`insert into auth.users (id, email) values ('${PRO}', 'pro@example.test'), ('${OTHER_PRO}', 'other@example.test'), ('${GO}', 'go@example.test');`);
  // Stand-ins for the organization objects the presence migration refers to (not under test here).
  psql(`create table organizations (id uuid primary key default gen_random_uuid());
        create function is_org_member(p_org uuid, p_user uuid) returns boolean language sql stable as $f$ select false $f$;
        do $p$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $p$;`);
  // The real migrations that define pairing, in order.
  psqlFile(path.join(migrations, '20260730000000_mobile_presence_phase1.sql'));
  psqlFile(path.join(migrations, '20260730020000_mobile_presence_pairing_enforcement.sql'));
  psql(`insert into user_entitlements (user_id, tier) values ('${PRO}', 'pro'), ('${OTHER_PRO}', 'pro'), ('${GO}', 'go') on conflict (user_id) do update set tier = excluded.tier;`);

  scenarios('as it stands');

  // The lifetime is the caller's to choose, as the function stands.
  const tenYears = begin(PRO, '315360000');
  console.log(`note as it stands: begin_pairing_session(315360000) issues a token valid for ${tenYears.seconds} seconds`);
  check('as it stands: the caller can ask for a ten-year token (the weakness the cap removes)', tenYears.seconds > 86_400 * 365);

  psqlFile(path.join(migrations, '20261011000000_security_pairing_expiry_cap.sql'));
  scenarios('with the cap');
  for (const [asked, expected] of [['315360000', 600], ['86400', 600], ['601', 600], ['600', 600], ['300', 300], ['60', 60], ['1', 60], ['0', 60], ['-500', 60], ['null', 300]]) {
    const got = begin(PRO, asked);
    check(`with the cap: asking for ${asked} seconds gives at most ${expected}`, got.seconds <= expected && got.seconds >= expected - 5, `got ${got.seconds}s`);
  }
  check('with the cap: a Paw Go account still cannot begin pairing', /requires Paw Pro/.test(begin(GO, '600').refused ?? ''));
} finally {
  spawnSync(exe('pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'ignore' });
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.log(`  FAILED: ${failure}`);
  process.exit(1);
}
