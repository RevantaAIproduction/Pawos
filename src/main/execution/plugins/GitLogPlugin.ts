import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { GitLogEntry } from '../../../shared/actions/GitTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

const DEFAULT_MAX_COUNT = 20;
/** Unit separator (\x1f) — won't appear in real commit metadata, so splitting on it is safe even if a subject line contains a pipe or comma. */
const FIELD_SEP = '\x1f';

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

function parseGitLog(output: string): GitLogEntry[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...subjectParts] = line.split(FIELD_SEP);
      return { hash: hash ?? '', author: author ?? '', date: date ?? '', subject: subjectParts.join(FIELD_SEP) };
    });
}

export class GitLogPlugin extends BasePlugin {
  id = 'gitLog';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitLog';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitLog') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitLog') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const maxCount = request.maxCount ?? DEFAULT_MAX_COUNT;
    const result = await runGit(
      ['log', `--format=%H${FIELD_SEP}%an${FIELD_SEP}%ad${FIELD_SEP}%s`, '--date=iso', '-n', String(maxCount)],
      request.cwd
    );
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { commits: parseGitLog(result.stdout) } };
  }

  describeInProgress(): string {
    return 'Checking recent commits…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitLog') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { commits: GitLogEntry[] } | undefined;
    const count = data?.commits.length ?? 0;
    return count === 0 ? 'No commits yet.' : `Here are the last ${count} commit${count === 1 ? '' : 's'}.`;
  }
}

export const gitLogPlugin = new GitLogPlugin();
