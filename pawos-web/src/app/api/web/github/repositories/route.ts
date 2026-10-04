import { NextResponse } from "next/server";
import { requireAccount } from "../../../../../lib/account/api";
import { WebChatError } from "../../../../../lib/webChat/errors";
import { listSelectableRepositories } from "../../../../../lib/webCode/repository";

/**
 * GET /api/web/github/repositories — the GitHub repositories the signed-in account can push to,
 * for choosing where PawOS Web makes code changes. Needs GitHub connected.
 * Read on the server with the account's own GitHub connection; no token reaches the browser.
 */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  try {
    const repositories = await listSelectableRepositories(guard.account);
    return NextResponse.json({ ok: true, repositories: repositories.map(({ fullName, defaultBranch, private: isPrivate }) => ({ fullName, defaultBranch, private: isPrivate })) });
  } catch (error) {
    const failure = error instanceof WebChatError ? error : new WebChatError("failed", "Couldn't load your repositories.", 500);
    return NextResponse.json({ ok: false, code: failure.code, message: failure.message }, { status: failure.status });
  }
}
