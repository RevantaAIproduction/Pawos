// Staging-only ownership tests for supabase/migrations/20260927010000_autonomous_run_evidence.sql.
//
// NEVER run against production. Needs a STAGING project (hosted or `supabase start`):
//   STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SUPABASE_SERVICE_ROLE_KEY
//
//   node supabase/tests/autonomous_run_evidence.rls.mjs snapshot   (BEFORE applying the migration)
//   node supabase/tests/autonomous_run_evidence.rls.mjs verify     (AFTER applying it)
//
// `snapshot` creates two throwaway users with one run each (service role) and records every run column.
// `verify` checks those runs are unchanged by the migration, then runs the ownership tests with real
// authenticated sessions (anon key + user sign-in), and finally deletes the test users (cascade).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const PRODUCTION_REF = 'krqdxdguqaoehrxhmggz';
const url = process.env.STAGING_SUPABASE_URL;
const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const mode = process.argv[2];
const STATE_FILE = path.join(process.cwd(), '.evidence-rls-test-state.json');

if (!url || !anonKey || !serviceKey) throw new Error('Set STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY and STAGING_SUPABASE_SERVICE_ROLE_KEY.');
if (url.includes(PRODUCTION_REF)) throw new Error('Refusing to run: this is the PRODUCTION project.');
if (mode !== 'snapshot' && mode !== 'verify') throw new Error('Usage: snapshot | verify');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function userClient(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

if (mode === 'snapshot') {
  const users = [];
  for (const who of ['owner', 'other']) {
    const email = `evidence-rls-${who}-${Date.now()}@example.test`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const { data: run, error: runError } = await admin
      .from('autonomous_task_runs')
      .insert({ user_id: data.user.id, organization_id: null, ticket_source: 'jira', ticket_id: `RLS-${who}`, runtime_version: 'test', status: 'completed', pr_url: 'https://example.test/pr/1', charged_usd: 7.5, files_changed: 3, lines_changed: 42 })
      .select('*')
      .single();
    if (runError) throw runError;
    users.push({ who, id: data.user.id, email, password, run });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(users, null, 2));
  console.log(`Snapshot saved (${users.length} users + runs). Apply the migration, then run: verify`);
  process.exit(0);
}

const [owner, other] = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
try {
  // Existing run records are untouched by the migration (every pre-existing column identical).
  for (const u of [owner, other]) {
    const { data: after } = await admin.from('autonomous_task_runs').select('*').eq('id', u.run.id).single();
    const changed = Object.keys(u.run).filter((k) => JSON.stringify(u.run[k]) !== JSON.stringify(after[k]));
    check(`existing run (${u.who}) unchanged by migration`, changed.length === 0, changed.join(', '));
    check(`new columns empty on existing run (${u.who})`, after.ticket_title === null && after.fix_summary === null);
  }

  const a = await userClient(owner.email, owner.password);
  const b = await userClient(other.email, other.password);
  const evId = randomUUID();
  const ownPath = `${owner.id}/${owner.run.id}/${evId}.png`;
  const bucket = (c) => c.storage.from('ticket-evidence');

  // Storage
  check('owner upload', !(await bucket(a).upload(ownPath, PNG, { contentType: 'image/png' })).error);
  check('owner read', Boolean((await bucket(a).download(ownPath)).data));
  check("other user's read denied", !(await bucket(b).download(ownPath)).data);
  check("other user can't sign a link to it", !(await bucket(b).createSignedUrl(ownPath, 60)).data?.signedUrl);
  check("other user's upload into owner's run denied", Boolean((await bucket(b).upload(`${owner.id}/${owner.run.id}/${randomUUID()}.png`, PNG, { contentType: 'image/png' })).error));
  check("owner's upload into another user's run denied", Boolean((await bucket(a).upload(`${owner.id}/${other.run.id}/${randomUUID()}.png`, PNG, { contentType: 'image/png' })).error));
  check('upload into a non-existent run denied', Boolean((await bucket(a).upload(`${owner.id}/${randomUUID()}/${randomUUID()}.png`, PNG, { contentType: 'image/png' })).error));
  check('non-PNG upload denied', Boolean((await bucket(a).upload(`${owner.id}/${owner.run.id}/${randomUUID()}.png`, Buffer.from('hi'), { contentType: 'text/plain' })).error));
  check('owner cannot overwrite evidence', Boolean((await bucket(a).upload(ownPath, PNG, { contentType: 'image/png', upsert: true })).error));
  await bucket(a).remove([ownPath]);
  check('owner cannot delete evidence', Boolean((await bucket(a).download(ownPath)).data));
  const bucketRow = await admin.storage.getBucket('ticket-evidence');
  check('bucket is private', bucketRow.data?.public === false);
  const signed = (await bucket(a).createSignedUrl(ownPath, 1)).data?.signedUrl;
  check('owner signed URL works', Boolean(signed) && (await fetch(signed)).ok);
  check('tampered signed URL denied', !(await fetch(`${signed}x`)).ok);
  await new Promise((r) => setTimeout(r, 2500));
  check('expired signed URL denied', !(await fetch(signed)).ok);
  check('public URL denied', !(await fetch(bucket(a).getPublicUrl(ownPath).data.publicUrl)).ok);

  // Evidence rows
  const add = (client, over) =>
    client.rpc('add_autonomous_run_evidence', {
      p_id: evId, p_run_id: owner.run.id, p_phase: 'before', p_kind: 'image', p_provider: 'web', p_label: 'Checkout overflows',
      p_target_description: 'http://localhost:5173', p_storage_path: ownPath, p_output_source: null, p_output_status: null,
      p_output_text: null, p_page_signals: null, p_captured_at: new Date().toISOString(), ...over,
    });
  check('owner attaches evidence to own run', !(await add(a, {})).error);
  check('same evidence id again is idempotent', !(await add(a, {})).error);
  check("other user can't attach to owner's run", Boolean((await add(b, { p_id: randomUUID() })).error));
  check("other user can't reuse owner's evidence id", Boolean((await add(b, { p_run_id: other.run.id })).error));
  check('image path must be owner/run/id', Boolean((await add(a, { p_id: randomUUID(), p_storage_path: `${other.id}/${owner.run.id}/x.png` })).error));
  check('image must actually be uploaded', Boolean((await add(a, { p_id: randomUUID(), p_storage_path: null })).error));
  check('output evidence (text) attaches', !(await add(a, { p_id: randomUUID(), p_kind: 'output', p_provider: 'output', p_storage_path: null, p_output_source: 'npm test', p_output_status: 1, p_output_text: 'Expected 30, got NaN' })).error);
  check('owner reads own evidence', ((await a.from('autonomous_run_evidence').select('id').eq('run_id', owner.run.id)).data ?? []).length === 2);
  check("other user reads none of owner's evidence", ((await b.from('autonomous_run_evidence').select('id').eq('run_id', owner.run.id)).data ?? []).length === 0);
  await b.from('autonomous_run_evidence').update({ label: 'hacked' }).eq('id', evId);
  await a.from('autonomous_run_evidence').update({ label: 'edited' }).eq('id', evId);
  await b.from('autonomous_run_evidence').delete().eq('id', evId);
  await a.from('autonomous_run_evidence').delete().eq('id', evId);
  const { data: stillThere } = await admin.from('autonomous_run_evidence').select('label').eq('id', evId).single();
  check('evidence cannot be edited or deleted by anyone', stillThere?.label === 'Checkout overflows');

  // Run details — owner only, and never billing/status
  const before = (await admin.from('autonomous_task_runs').select('*').eq('id', owner.run.id).single()).data;
  check('owner records ticket title / fix summary', !(await a.rpc('record_autonomous_run_details', { p_run_id: owner.run.id, p_ticket_title: 'Checkout layout', p_fix_summary: 'Constrained the banner width.' })).error);
  check("other user can't record details on owner's run", Boolean((await b.rpc('record_autonomous_run_details', { p_run_id: owner.run.id, p_ticket_title: 'x', p_fix_summary: 'x' })).error));
  const after = (await admin.from('autonomous_task_runs').select('*').eq('id', owner.run.id).single()).data;
  const touched = Object.keys(before).filter((k) => !['ticket_title', 'fix_summary'].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  check('details write touched no billing/status column', touched.length === 0, touched.join(', '));
  check('details saved', after.ticket_title === 'Checkout layout' && after.fix_summary === 'Constrained the banner width.');
} finally {
  // Staging clean-up with the service role: stored images, then the test runs (evidence rows cascade), then the users.
  for (const u of [owner, other]) {
    const { data: objects } = await admin.storage.from('ticket-evidence').list(`${u.id}/${u.run.id}`);
    if (objects?.length) await admin.storage.from('ticket-evidence').remove(objects.map((o) => `${u.id}/${u.run.id}/${o.name}`));
    await admin.from('autonomous_task_runs').delete().eq('id', u.run.id);
    await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
  }
  fs.rmSync(STATE_FILE, { force: true });
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
