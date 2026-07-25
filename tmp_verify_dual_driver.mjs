import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = process.cwd();
const electronExe = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const SCRATCH = 'C:\\Users\\APPLE\\AppData\\Local\\Temp\\claude\\C--Users-APPLE-Downloads-PawOS\\6d114e71-e547-4129-923b-e83352ed6cc7\\scratchpad';
const PROFILE_FOUNDER = path.join(SCRATCH, 'profile-founder');
const PROFILE_PAWOS = path.join(SCRATCH, 'profile-pawos');
fs.mkdirSync(PROFILE_FOUNDER, { recursive: true });
fs.mkdirSync(PROFILE_PAWOS, { recursive: true });

const RESULTS_FILE = 'tmp_verify_results.json';
function loadResults() { try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch { return {}; } }
function saveResults(r) { fs.writeFileSync(RESULTS_FILE, JSON.stringify(r, null, 2)); }
const results = loadResults();

function errify(e) {
  if (e && typeof e === 'object') return { message: e.message, code: e.code, details: e.details, hint: e.hint, str: String(e) };
  return { str: String(e) };
}

async function waitForSignIn(page, expectedEmail, label, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const user = await page.evaluate(async () => {
      try {
        const v = window.__connectivityVerify__;
        if (!v) return null;
        return await v.authService.getCurrentUser();
      } catch { return null; }
    });
    if (user && user.email && user.email.toLowerCase() === expectedEmail.toLowerCase()) {
      console.log(`[${label}] signed in as ${user.email} (${user.id})`);
      return user;
    }
    if (user) console.log(`[${label}] currently signed in as ${user.email}, waiting for ${expectedEmail}...`);
    else console.log(`[${label}] not signed in yet, waiting...`);
    await page.waitForTimeout(4000);
  }
  throw new Error(`[${label}] timed out waiting for sign-in as ${expectedEmail}`);
}

console.log('Launching founder window (fresh profile)...');
const appF = await electron.launch({ executablePath: electronExe, args: [APP_DIR, `--user-data-dir=${PROFILE_FOUNDER}`] });
const pageF = await appF.firstWindow();
await pageF.waitForTimeout(2000);

console.log('Launching pawos window (fresh profile)...');
const appP = await electron.launch({ executablePath: electronExe, args: [APP_DIR, `--user-data-dir=${PROFILE_PAWOS}`] });
const pageP = await appP.firstWindow();
await pageP.waitForTimeout(2000);

console.log('\n=== ACTION NEEDED ===');
console.log('Two PawOS windows are now open with fresh, isolated profiles.');
console.log('In the FIRST window (launched first), sign in with Google as founder@revantaai.com.');
console.log('In the SECOND window (launched second), sign in with Google as pawos@revantaai.com.');
console.log('Waiting up to 10 minutes for both...\n');

const userF = await waitForSignIn(pageF, 'founder@revantaai.com', 'founder-window', 10 * 60 * 1000);
const userP = await waitForSignIn(pageP, 'pawos@revantaai.com', 'pawos-window', 10 * 60 * 1000);

// ---- Founder side: get org, invite pawos (idempotent-ish), store rows ----
const founderResult = await pageF.evaluate(async () => {
  const trace = [];
  const errify2 = (e) => (e && typeof e === 'object') ? { message: e.message, code: e.code, str: String(e) } : { str: String(e) };
  try {
    const v = window.__connectivityVerify__;
    const user = await v.authService.getCurrentUser();
    const orgs = await v.organizationService.getMyOrganizations();
    const org = orgs[0];
    if (!org) return { error: 'founder has no org', trace };
    trace.push('org=' + org.id);

    let invite;
    try {
      invite = await v.organizationService.inviteMember(org.id, 'pawos@revantaai.com', 'member');
      trace.push('invited fresh');
    } catch (e) {
      trace.push('invite error (may already be invited/active): ' + JSON.stringify(errify2(e)));
      invite = { alreadyExistsOrError: errify2(e) };
    }

    const scopeOrg = { userId: user.id, organizationId: org.id };
    const scopeSolo = { userId: user.id };

    await v.connectivityCredentialService.store(scopeOrg, 'verify-test-connector', 'apiToken', 'founder-org-secret-2');
    await v.connectionManagerService.upsert(scopeOrg, {
      id: 'conn-founder-org-1', connectorId: 'verify-test-connector', scope: scopeOrg,
      status: 'connected', grantedPermissions: [], metadata: { note: 'founder org row' },
    });
    const profile = await v.deploymentProfileService.create(scopeOrg, 'founder-org-profile-dual', { kind: 'managedPlatform', connectorId: 'verify-test-connector' }, false);
    await v.connectivityCredentialService.store(scopeSolo, 'verify-test-connector-solo', 'apiToken', 'founder-solo-secret-2');

    const readBack = await v.connectivityCredentialService.read(scopeOrg, 'verify-test-connector');

    return {
      userId: user.id, orgId: org.id, orgName: org.name, orgDomain: org.domain,
      invite, readBackSecret: readBack ? readBack.secret : null, profileId: profile.id, trace,
    };
  } catch (e) {
    return { error: errify2(e), trace };
  }
});
console.log('\n--- founder result ---');
console.log(JSON.stringify(founderResult, null, 2));
results.dual_founder_setup = founderResult;
saveResults(results);

const orgId = founderResult.orgId;

// ---- Pawos side: accept invite, test isolation, store own rows ----
const pawosResult = await pageP.evaluate(async (orgId) => {
  const trace = [];
  const errify2 = (e) => (e && typeof e === 'object') ? { message: e.message, code: e.code, str: String(e) } : { str: String(e) };
  try {
    const v = window.__connectivityVerify__;
    const user = await v.authService.getCurrentUser();

    let acceptResult = 'ok';
    try {
      const invites = await v.organizationService.listMyPendingInvites();
      trace.push('pendingInvites=' + JSON.stringify(invites));
      await v.organizationService.acceptInvite(orgId);
      trace.push('accepted');
    } catch (e) {
      acceptResult = errify2(e);
      trace.push('accept error (may already be a member): ' + JSON.stringify(acceptResult));
    }

    const scopeOrg = { userId: user.id, organizationId: orgId };
    const scopeSolo = { userId: user.id };

    const foundersCredAsSeenByPawos = await v.connectivityCredentialService.read(scopeOrg, 'verify-test-connector');
    const foundersConnAsSeenByPawos = await v.connectionManagerService.list(scopeOrg);
    const foundersProfilesAsSeenByPawos = await v.deploymentProfileService.list(scopeOrg);

    await v.connectivityCredentialService.store(scopeOrg, 'verify-test-connector', 'apiToken', 'pawos-org-secret-2');
    await v.connectivityCredentialService.store(scopeSolo, 'verify-test-connector-solo', 'apiToken', 'pawos-solo-secret-2');
    const ownReadBack = await v.connectivityCredentialService.read(scopeOrg, 'verify-test-connector');

    return {
      userId: user.id, acceptResult,
      foundersCredSecretAsSeenByPawos: foundersCredAsSeenByPawos ? foundersCredAsSeenByPawos.secret : null,
      foundersConnCountAsSeenByPawos: foundersConnAsSeenByPawos.length,
      foundersProfileCountAsSeenByPawos: foundersProfilesAsSeenByPawos.length,
      ownReadBackSecret: ownReadBack ? ownReadBack.secret : null,
      trace,
    };
  } catch (e) {
    return { error: errify2(e), trace };
  }
}, orgId);
console.log('\n--- pawos result ---');
console.log(JSON.stringify(pawosResult, null, 2));
results.dual_pawos_setup = pawosResult;
saveResults(results);

console.log('\nLeaving both windows open for follow-up (tharun setup + hydration check). Not closing yet.');
