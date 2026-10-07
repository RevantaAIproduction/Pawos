import * as os from "os";
import * as path from "path";
import pkg from "../package.json";
import { resolveApiConfig, type ApiConfig } from "./shared";

/** The CLI's version — read from package.json, the only place it is written. */
export const VERSION: string = pkg.version;

type Env = Record<string, string | undefined>;

/**
 * PawOS's address. PAWOS_API_URL points the CLI at another PawOS (a local development server);
 * unset, it is the public one. It is the only address the CLI ever sends a session to.
 */
export function apiConfig(env: Env): ApiConfig {
  return resolveApiConfig(env.PAWOS_API_URL, "PAWOS_API_URL");
}

/** Where the CLI keeps its small files (never a token, when a credential store is available). */
export function configDirectory(env: Env, platform: string = process.platform, home: string = os.homedir()): string {
  if (env.PAWOS_CONFIG_DIR) return env.PAWOS_CONFIG_DIR;
  if (platform === "win32") return path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "pawos");
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "pawos");
  return path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "pawos");
}
