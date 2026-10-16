import * as path from 'path';
import { app } from 'electron';
import { accountSession } from '../../auth/AccountSession';
import { trashStore } from '../plugins/recycleBin';
import { CodeChangeLedgerStore } from './CodeChangeLedger';
import { enforceCodingRuntimeSecurity } from '../CodingRuntimeSecurity';
import { anyActionInFlight } from '../ExecutionCancellation';
import { createLocalCodingRuntimeSession } from '../../../shared/actions/CodingRuntimeSessionTypes';
import type { ActionRequest } from '../../../shared/actions/ActionTypes';

let store: CodeChangeLedgerStore | null = null;

/** The app's change ledger, under userData/code-changes, scoped to the verified signed-in account. */
export function codeChangeStore(): CodeChangeLedgerStore {
  if (!store) {
    store = new CodeChangeLedgerStore(path.join(app.getPath('userData'), 'code-changes'), {
      getAccountId: () => accountSession.verifiedUserId,
      moveToTrash: (absPath) => trashStore.moveToTrash(absPath),
      // A revert writes through the same file boundary the Coding Runtime enforces for writeFile,
      // scoped to the task's project root.
      checkWriteBoundary: (absPath, projectRoot) => {
        const check = enforceCodingRuntimeSecurity({
          type: 'writeFile',
          path: absPath,
          content: '',
          codingRuntimeSession: createLocalCodingRuntimeSession({ id: `revert:${projectRoot}`, rootPath: projectRoot, createdAt: Date.now() }),
        } as ActionRequest);
        return check.ok ? null : check.result.message ?? 'That path is outside the allowed workspace.';
      },
      // Never revert while a task step runs: it could write the same file in between.
      isBusy: () => anyActionInFlight(),
    });
  }
  return store;
}
