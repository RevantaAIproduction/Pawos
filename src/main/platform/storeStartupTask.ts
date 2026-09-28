import { execFile } from 'child_process';
import { STORE_STARTUP_TASK_ID } from './storeRuntime';

/** Windows.ApplicationModel.StartupTaskState names. */
export type StartupTaskState = 'Disabled' | 'DisabledByUser' | 'Enabled' | 'DisabledByPolicy' | 'EnabledByPolicy';

const KNOWN_STATES: readonly StartupTaskState[] = ['Disabled', 'DisabledByUser', 'Enabled', 'DisabledByPolicy', 'EnabledByPolicy'];

// Windows.ApplicationModel.StartupTask is a WinRT API with no Electron binding. A PowerShell
// process launched by a packaged app runs with that package's identity, so it can resolve the
// StartupTask declared in the package manifest (build/msix/extensions.xml). Only used when
// running as the Microsoft Store (MSIX) build.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
} | Select-Object -First 1
function Await($op, [type]$resultType) {
  $t = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}
[Windows.ApplicationModel.StartupTask, Windows.ApplicationModel, ContentType = WindowsRuntime] | Out-Null
$task = Await ([Windows.ApplicationModel.StartupTask]::GetAsync($env:PAWOS_STARTUP_TASK_ID)) ([Windows.ApplicationModel.StartupTask])
switch ($env:PAWOS_STARTUP_ACTION) {
  'enable'  { Write-Output (Await ($task.RequestEnableAsync()) ([Windows.ApplicationModel.StartupTaskState])) }
  'disable' { $task.Disable(); Write-Output $task.State }
  default   { Write-Output $task.State }
}
`;

function runStartupTaskScript(action: 'get' | 'enable' | 'disable'): Promise<StartupTaskState> {
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        timeout: 15000,
        env: { ...process.env, PAWOS_STARTUP_TASK_ID: STORE_STARTUP_TASK_ID, PAWOS_STARTUP_ACTION: action },
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`StartupTask ${action} failed: ${stderr?.toString().trim() || err.message}`));
          return;
        }
        const state = stdout.toString().trim().split(/\r?\n/).pop()?.trim() as StartupTaskState | undefined;
        if (state && KNOWN_STATES.includes(state)) resolve(state);
        else reject(new Error(`StartupTask ${action} returned an unexpected state: ${JSON.stringify(stdout.toString().trim())}`));
      }
    );
  });
}

export const storeStartupTask = {
  getState: () => runStartupTaskScript('get'),
  enable: () => runStartupTaskScript('enable'),
  disable: () => runStartupTaskScript('disable'),
};

export type StoreStartupTaskApi = typeof storeStartupTask;
