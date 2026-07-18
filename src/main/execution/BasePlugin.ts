import type { ActionRequest, ActionRequirement, ActionResult } from '../../shared/actions/ActionTypes';
import type { ObservationEvent } from '../../shared/actions/ExecutionLifecycle';
import type { DesktopPlugin, PrepareResult } from './DesktopPlugin';

/** Default no-op requirements()/prepare()/observe()/verify()/recover() — most plugins have nothing missing to ask about, nothing to stage, nothing to observe mid-flight, nothing honest to verify beyond their own execute() result, and no safe way to auto-remediate a failure — so only override these when there's something real to do. */
export abstract class BasePlugin implements DesktopPlugin {
  abstract id: string;
  abstract canHandle(request: ActionRequest): boolean;
  abstract execute(request: ActionRequest): Promise<ActionResult>;
  abstract describeInProgress(request: ActionRequest): string;
  abstract describeDone(request: ActionRequest, result: ActionResult): string;

  requirements(_request: ActionRequest): ActionRequirement[] {
    return [];
  }

  async prepare(_request: ActionRequest): Promise<PrepareResult> {
    return { requirements: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async *observe(_request: ActionRequest, _executeResult: ActionResult): AsyncGenerator<ObservationEvent> {
    return;
  }

  async verify(_request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    return result;
  }

  async recover(_request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    return result;
  }
}
