import * as vscode from "vscode";
import { PawosClient } from "./api/pawosClient";
import { SESSION_SECRET_KEY, SessionStore } from "./auth/sessionStore";
import { PawosController } from "./controller";
import { WorkspaceRepository } from "./git/workspaceRemote";
import { SIDEBAR_VIEW_ID, SidebarProvider } from "./ui/sidebarProvider";
import { looksLikeLoginCode } from "../../pawos-shared/src/auth/deviceLogin";
import { SessionManager } from "../../pawos-shared/src/auth/session";
import { resolveApiConfig, type ApiConfig } from "../../pawos-shared/src/config";

/**
 * PawOS for VS Code — a thin client of PawOS Web's existing Code mode. It signs in to the PawOS
 * account, shows the plan and the repository PawOS works on, sends one task, and shows the result.
 * The work itself (the model, GitHub, entitlements, usage) happens on PawOS's servers, unchanged.
 */
function readConfig(): ApiConfig {
  return resolveApiConfig(vscode.workspace.getConfiguration("pawos").get<string>("apiBaseUrl"), "The PawOS: Api Base Url setting");
}

function apiBaseUrl(): string {
  const config = readConfig();
  if (!config.ok) throw new Error(config.problem);
  return config.config.apiBaseUrl;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // The session lives in VS Code SecretStorage (the operating system's keychain) and nowhere else.
  const session = new SessionManager({ storage: new SessionStore(context.secrets), getApiBaseUrl: apiBaseUrl });
  const client = new PawosClient(apiBaseUrl, (forceRefresh) => session.getAccessToken(forceRefresh), () => session.expire());
  const openExternal = (url: string) => Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url, true)));

  /**
   * The PawOS browser sign-in, the same one the PawOS CLI uses: the browser opens PawOS, the user
   * signs in the way they always do and is shown a one-time code, and pastes it here.
   */
  const startSignIn = async () => {
    const pending = session.beginSignIn("vscode");
    try {
      if (!(await openExternal(pending.url))) throw new Error("The browser couldn't be opened for sign-in.");
      const code = await vscode.window.showInputBox({
        title: "Sign in to PawOS",
        prompt: "Sign in in your browser, then paste the authentication code PawOS shows you.",
        placeHolder: "PAWOS-XXXX-XXXX",
        ignoreFocusOut: true,
        validateInput: (value) => (!value.trim() || looksLikeLoginCode(value) ? null : "The code looks like PAWOS-XXXX-XXXX."),
      });
      if (!code?.trim()) return pending.cancel();
      await pending.complete(code);
    } catch (error) {
      pending.cancel();
      throw error;
    }
  };

  const workspaceRepository = new WorkspaceRepository();
  const controller = new PawosController({
    auth: session,
    startSignIn,
    client,
    getConfig: readConfig,
    getWorkspaceRepository: () => workspaceRepository.current,
    confirm: async (message, action) => (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action,
    openExternal,
  });

  context.subscriptions.push(
    workspaceRepository,
    workspaceRepository.onDidChange(() => controller.workspaceChanged()),
    vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, new SidebarProvider(context.extensionUri, controller)),
    vscode.commands.registerCommand("pawos.signIn", () => controller.signIn()),
    vscode.commands.registerCommand("pawos.signOut", () => controller.signOut()),
    vscode.commands.registerCommand("pawos.refresh", () => controller.refresh()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("pawos")) void controller.refresh();
    }),
    // Signing in or out in another VS Code window shows here too.
    context.secrets.onDidChange((event) => {
      if (event.key === SESSION_SECRET_KEY && session.status !== "signingIn") void session.initialize();
    })
  );

  await session.initialize();
  void workspaceRepository.start();
  void controller.refresh();
}

export function deactivate(): void {}
