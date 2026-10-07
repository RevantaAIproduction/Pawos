import * as vscode from "vscode";
import { githubRepositoryFromRemote } from "./remote";

/** The parts of VS Code's built-in Git extension API (version 1) this reads. */
interface GitRemote {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
}
interface GitRepository {
  rootUri: vscode.Uri;
  state: { remotes: GitRemote[]; onDidChange: vscode.Event<void> };
}
interface GitApi {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
}

/**
 * The GitHub repository (`owner/name`) of the folder open in VS Code, read from its Git remotes
 * through VS Code's built-in Git extension. Read-only: it never runs Git, changes a remote, or
 * touches a file — and it never changes which repository PawOS works on.
 */
export class WorkspaceRepository implements vscode.Disposable {
  current: string | null = null;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly subscriptions: vscode.Disposable[] = [this.changed];
  private readonly watched = new Set<GitRepository>();
  private api: GitApi | null = null;

  async start(): Promise<void> {
    try {
      const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>("vscode.git");
      if (!extension) return;
      const exports = extension.isActive ? extension.exports : await extension.activate();
      this.api = exports.getAPI(1);
    } catch {
      return; // Git is disabled or unavailable: there is simply no workspace repository to show.
    }
    const api = this.api;
    for (const repository of api.repositories) this.watch(repository);
    this.subscriptions.push(
      api.onDidOpenRepository((repository) => {
        this.watch(repository);
        this.update();
      }),
      api.onDidCloseRepository((repository) => {
        this.watched.delete(repository);
        this.update();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.update())
    );
    this.update();
  }

  private watch(repository: GitRepository): void {
    if (this.watched.has(repository)) return;
    this.watched.add(repository);
    this.subscriptions.push(repository.state.onDidChange(() => this.update()));
  }

  private update(): void {
    const next = this.read();
    if (next === this.current) return;
    this.current = next;
    this.changed.fire();
  }

  private read(): string | null {
    const repositories = this.api?.repositories ?? [];
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.toString();
    // The repository of the first workspace folder; otherwise the first one Git found.
    const ordered = [...repositories].sort((a, b) => Number(b.rootUri.toString() === folder) - Number(a.rootUri.toString() === folder));
    for (const repository of ordered) {
      const remotes = [...repository.state.remotes].sort((a, b) => Number(b.name === "origin") - Number(a.name === "origin"));
      for (const remote of remotes) {
        const name = githubRepositoryFromRemote(remote.fetchUrl ?? remote.pushUrl);
        if (name) return name;
      }
    }
    return null;
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }
}
