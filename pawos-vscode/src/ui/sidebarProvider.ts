import { randomBytes } from "crypto";
import * as vscode from "vscode";
import type { PawosController } from "../controller";

export const SIDEBAR_VIEW_ID = "pawos.sidebar";

/**
 * The PawOS sidebar: a small webview that draws the controller's state and sends button presses
 * back. The webview is given display data only — it never receives the session or any token — and
 * it can load nothing but this extension's own stylesheet and script.
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: PawosController
  ) {
    controller.onDidChange(() => this.post());
  }

  private post(): void {
    void this.view?.webview.postMessage({ type: "state", state: this.controller.state });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const media = vscode.Uri.joinPath(this.extensionUri, "media");
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview, media);
    view.onDidDispose(() => {
      if (this.view === view) this.view = null;
    });
    view.webview.onDidReceiveMessage((message: { type?: unknown; text?: unknown; which?: unknown }) => {
      const controller = this.controller;
      switch (message?.type) {
        case "ready":
          return this.post();
        case "signIn":
          return void vscode.commands.executeCommand("pawos.signIn");
        case "signOut":
          return void controller.signOut();
        case "refresh":
          return void controller.refresh();
        case "openSettings":
          return void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:revantaai.pawos");
        case "useWorkspaceRepository":
          return void controller.useWorkspaceRepository();
        case "run":
          return void controller.runTask(typeof message.text === "string" ? message.text : "");
        case "checkAgain":
          return void controller.checkAgain();
        case "newTask":
          return controller.newTask();
        case "open":
          if (message.which === "commit" || message.which === "pullRequest") return void controller.open(message.which);
          return;
      }
    });
  }

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = randomBytes(16).toString("base64");
    const style = webview.asWebviewUri(vscode.Uri.joinPath(media, "sidebar.css"));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(media, "sidebar.js"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${style}">
  <title>PawOS</title>
</head>
<body>
  <main id="app"></main>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
