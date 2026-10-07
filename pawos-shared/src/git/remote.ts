/**
 * Works out the GitHub repository (`owner/name`) a Git remote URL points at, or null when it isn't
 * a github.com repository. Only reads the URL text — no Git command is run and nothing is fetched.
 */
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

export function githubRepositoryFromRemote(remoteUrl: string | null | undefined): string | null {
  const url = (remoteUrl ?? "").trim();
  if (!url) return null;
  // git@github.com:owner/name(.git)   |   https://github.com/owner/name(.git)   |   ssh://git@github.com/owner/name(.git)
  const match = /^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url);
  if (!match) return null;
  const [, owner, name] = match;
  if (!owner || !name || !NAME.test(owner) || !NAME.test(name) || name === "." || name === "..") return null;
  return `${owner}/${name}`;
}

/** GitHub names are case-insensitive. */
export function sameRepository(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && a!.toLowerCase() === b!.toLowerCase();
}
