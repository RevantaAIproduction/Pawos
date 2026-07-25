import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR = process.cwd();
const electronExe = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const STEP = process.env.VERIFY_STEP;
const RESULTS_FILE = 'tmp_verify_results.json';

function loadResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch { return {}; }
}
function saveResults(r) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(r, null, 2));
}

const app = await electron.launch({ executablePath: electronExe, args: [APP_DIR] });
const page = await app.firstWindow();
await page.waitForTimeout(3500);

const results = loadResults();

async function run(fn) {
  try {
    const out = await page.evaluate(fn);
    return { ok: true, out };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

if (STEP === '1_founder_setup') {
  const r = await run(async () => {
    const trace = [];
    const errify = (e) => {
      if (e && typeof e === 'object') {
        return { message: e.message, code: e.code, details: e.details, hint: e.hint, name: e.name, str: String(e) };
      }
      return { str: String(e) };
    };
    try {
      const v = window.__connectivityVerify__;
      trace.push('got v');
      const user = await v.authService.getCurrentUser();
      trace.push('got user ' + (user && user.id));
      const orgs = await v.organizationService.getMyOrganizations();
      trace.push('got orgs ' + orgs.length);
      const org = orgs[0];
      if (!org) return { error: 'no org', trace };

      let invite;
      try {
        invite = await v.organizationService.inviteMember(org.id, 'pawos@revantaai.com', 'member');
        trace.push('invited');
      } catch (e) {
        trace.push('invite failed: ' + JSON.stringify(errify(e)));
        invite = { error: errify(e) };
      }

      const scopeOrg = { userId: user.id, organizationId: org.id };
      const scopeSolo = { userId: user.id };

      await v.connectivityCredentialService.store(scopeOrg, 'verify-test-connector', 'apiToken', 'founder-org-secret-1');
      trace.push('stored org cred');
      await v.connectionManagerService.upsert(scopeOrg, {
        id: 'conn-founder-org-1', connectorId: 'verify-test-connector', scope: scopeOrg,
        status: 'connected', grantedPermissions: [], metadata: { note: 'founder org row' },
      });
      trace.push('stored org conn');
      const profile = await v.deploymentProfileService.create(scopeOrg, 'founder-org-profile', { kind: 'managedPlatform', connectorId: 'verify-test-connector' }, false);
      trace.push('created profile');

      await v.connectivityCredentialService.store(scopeSolo, 'verify-test-connector-solo', 'apiToken', 'founder-solo-secret-1');
      trace.push('stored solo cred');

      const readBack = await v.connectivityCredentialService.read(scopeOrg, 'verify-test-connector');
      const connList = await v.connectionManagerService.list(scopeOrg);
      const profileList = await v.deploymentProfileService.list(scopeOrg);

      return {
        userId: user.id, orgId: org.id, orgName: org.name, orgDomain: org.domain,
        invite, readBackSecret: readBack ? readBack.secret : null,
        connCount: connList.length, profileId: profile.id, profileCount: profileList.length,
        trace,
      };
    } catch (e) {
      return { error: errify(e), trace };
    }
  });
  results.step1_founder_setup = r;
  saveResults(results);
  console.log(JSON.stringify(r, null, 2));

} else if (STEP === '1b_founder_restart_check') {
  const r = await run(async () => {
    const v = window.__connectivityVerify__;
    const user = await v.authService.getCurrentUser();
    if (!user) return { restoredSession: false };
    const orgs = await v.organizationService.getMyOrganizations();
    const org = orgs[0];
    const scopeOrg = { userId: user.id, organizationId: org.id };
    const scopeSolo = { userId: user.id };
    const cred = await v.connectivityCredentialService.read(scopeOrg, 'verify-test-connector');
    const credSolo = await v.connectivityCredentialService.read(scopeSolo, 'verify-test-connector-solo');
    const conns = await v.connectionManagerService.list(scopeOrg);
    const profiles = await v.deploymentProfileService.list(scopeOrg);
    return {
      restoredSession: true, userId: user.id, orgId: org.id,
      credSecretAfterRestart: cred ? cred.secret : null,
      credSoloSecretAfterRestart: credSolo ? credSolo.secret : null,
      connCountAfterRestart: conns.length,
      profileCountAfterRestart: profiles.length,
    };
  });
  results.step1b_founder_restart_check = r;
  saveResults(results);
  console.log(JSON.stringify(r, null, 2));

} else if (STEP === '2_pawos_setup') {
  const prior = results.step1_founder_setup?.out;
  const orgId = prior?.orgId;
  const r = await run(async (orgId) => {
    const v = window.__connectivityVerify__;
    await v.authService.signOut();
    let user;
    try {
      user = await v.authService.createEmailAccount({ name: 'Pawos Test', email: 'pawos@revantaai.com', password: 'Verify-Test-Pw-1!' });
    } catch (e) {
      return { stage: 'createEmailAccount', error: String(e && e.message ? e.message : e) };
    }

    const invites = await v.organizationService.listMyPendingInvites();
    await v.organizationService.acceptInvite(orgId);

    const scopeOrg = { userId: user.id, organizationId: orgId };
    const scopeSolo = { userId: user.id };

    // Attempt to read founder's org-scoped row BEFORE writing our own — proves org membership alone doesn't grant visibility.
    const foundersCredAsSeenByPawos = await v.connectivityCredentialService.read(scopeOrg, 'verify-test-connector');
    const foundersConnsAsSeenByPawos = await v.connectionManagerService.list(scopeOrg);

    await v.connectivityCredentialService.store(scopeOrg, 'verify-test-connector', 'apiToken', 'pawos-org-secret-1');
    await v.connectionManagerService.upsert(scopeOrg, {
      id: 'conn-pawos-org-1', connectorId: 'verify-test-connector', scope: scopeOrg,
      status: 'connected', grantedPermissions: [], metadata: { note: 'pawos org row' },
    });
    await v.connectivityCredentialService.store(scopeSolo, 'verify-test-connector-solo', 'apiToken', 'pawos-solo-secret-1');

    const ownReadBack = await v.connectivityCredentialService.read(scopeOrg, 'verify-test-connector');
    const ownConnList = await v.connectionManagerService.list(scopeOrg);

    return {
      userId: user.id, invites, orgId,
      foundersCredAsSeenByPawos: foundersCredAsSeenByPawos ? foundersCredAsSeenByPawos.secret : null,
      foundersConnCountAsSeenByPawos: foundersConnsAsSeenByPawos.length,
      ownReadBackSecret: ownReadBack ? ownReadBack.secret : null,
      ownConnCount: ownConnList.length,
    };
  }, orgId);
  results.step2_pawos_setup = r;
  saveResults(results);
  console.log(JSON.stringify(r, null, 2));

} else if (STEP === '2b_pawos_restart_check') {
  const r = await run(async () => {
    const v = window.__connectivityVerify__;
    const user = await v.authService.getCurrentUser();
    if (!user) return { restoredSession: false };
    return { restoredSession: true, userId: user.id };
  });
  results.step2b_pawos_restart_check = r;
  saveResults(results);
  console.log(JSON.stringify(r, null, 2));

} else if (STEP === '3_tharun_setup') {
  const prior = results.step1_founder_setup?.out;
  const priorPawos = results.step2_pawos_setup?.out;
  const orgId = prior?.orgId;
  const r = await run(async (orgId) => {
    const v = window.__connectivityVerify__;
    await v.authService.signOut();
    let user;
    try {
      user = await v.authService.createEmailAccount({ name: 'Tharun Personal', email: 'tharun.esta@gmail.com', password: 'Verify-Test-Pw-1!' });
    } catch (e) {
      return { stage: 'createEmailAccount', error: String(e && e.message ? e.message : e) };
    }

    let orgCreateError = null;
    try {
      await v.organizationService.createOrganization('Should Fail Org', 'team');
    } catch (e) {
      orgCreateError = String(e && e.message ? e.message : e);
    }

    const scopeOrgGuess = { userId: user.id, organizationId: orgId };
    const scopeSolo = { userId: user.id };

    const orgCredAsSeenByTharun = await v.connectivityCredentialService.read(scopeOrgGuess, 'verify-test-connector');
    const orgConnAsSeenByTharun = await v.connectionManagerService.list(scopeOrgGuess);
    const founderSoloCredAsSeenByTharun = await v.connectivityCredentialService.read(scopeSolo, 'verify-test-connector-solo');

    await v.connectivityCredentialService.store(scopeSolo, 'verify-test-connector-solo', 'apiToken', 'tharun-solo-secret-1');
    const ownReadBack = await v.connectivityCredentialService.read(scopeSolo, 'verify-test-connector-solo');

    return {
      userId: user.id, orgCreateError,
      orgCredAsSeenByTharun: orgCredAsSeenByTharun ? orgCredAsSeenByTharun.secret : null,
      orgConnCountAsSeenByTharun: orgConnAsSeenByTharun.length,
      founderSoloCredAsSeenByTharun: founderSoloCredAsSeenByTharun ? founderSoloCredAsSeenByTharun.secret : null,
      ownReadBackSecret: ownReadBack ? ownReadBack.secret : null,
    };
  }, orgId);
  results.step3_tharun_setup = r;
  saveResults(results);
  console.log(JSON.stringify(r, null, 2));

} else if (STEP === '4_hydration_check') {
  const prior = results.step1_founder_setup?.out;
  const r = await run(async () => {
    const v = window.__connectivityVerify__;
    const user = await v.authService.getCurrentUser();
    if (!user) return { error: 'no session' };
    const orgs = await v.organizationService.getMyOrganizations();
    const org = orgs[0];
    const scopeOrg = { userId: user.id, organizationId: org.id };
    const profiles = await v.deploymentProfileService.list(scopeOrg);
    if (profiles.length === 0) return { error: 'no persisted profile found to hydrate' };
    const p = profiles[0];
    const hydratePayload = {
      id: p.id, scope: scopeOrg, name: p.name, config: p.config, isDefault: p.isDefault,
    };
    const hydrateResult = await window.__pawos_ipc__.connectivityDeploymentProfilesHydrate(hydratePayload);
    const mainList = await window.__pawos_ipc__.connectivityDeploymentProfilesList(scopeOrg);
    return { profileId: p.id, hydrateResult, mainProcessList: mainList };
  });
  results.step4_hydration_check = r;
  saveResults(results);
  console.log(JSON.stringify(r, null, 2));

} else {
  console.log('Unknown or missing VERIFY_STEP env var');
}

await app.close();
