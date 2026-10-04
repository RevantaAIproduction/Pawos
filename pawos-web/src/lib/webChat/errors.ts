export type WebChatFailureCode =
  | "invalid_message"
  /** The prompt is longer than the plan accepts (Paw Go: short prompts only). */
  | "prompt_too_long"
  | "invalid_attachment"
  | "capability_locked"
  | "message_limit_reached"
  | "usage_limit_reached"
  | "upload_limit_reached"
  | "chat_not_found"
  | "not_found"
  /** The send was received and is still being answered (HTTP 202) — ask again shortly. */
  | "processing"
  /** Frontend changes: what is missing before PawOS Web can change a repository. */
  | "github_not_connected"
  | "github_needs_reauth"
  | "repository_not_selected"
  | "repository_no_access"
  /** Frontend changes: the proposed change broke the frontend-only policy, or GitHub refused it. */
  | "change_refused"
  | "github_unavailable"
  | "not_configured"
  | "model_unavailable"
  | "failed";

export class WebChatError extends Error {
  constructor(
    readonly code: WebChatFailureCode,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
