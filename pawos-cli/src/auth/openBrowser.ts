import { spawn } from "child_process";

/**
 * Opens an address in the user's browser. The address is passed as one argument to the operating
 * system's own opener — never through a shell — and only an http(s) address is ever opened.
 * Resolves false when the browser couldn't be started; the CLI always prints the address as well.
 */
export function openerFor(platform: string, url: string): { command: string; args: string[] } {
  if (platform === "win32") return { command: "rundll32", args: ["url.dll,FileProtocolHandler", url] };
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}

export function openBrowser(url: string, platform: string = process.platform): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.resolve(false);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return Promise.resolve(false);
  const { command, args } = openerFor(platform, parsed.toString());
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true, shell: false });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
