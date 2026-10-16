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
  /**
   * Local tasks: the model's reply for the next step was cut off at the output limit more than once,
   * even after it was asked for a smaller step. Not retried: the task stops where it is, with
   * everything done so far kept, and the user is told how to go on.
   */
  | "step_too_large"
  /**
   * Local tasks: the model stayed unavailable for one step through every try that step was allowed
   * (a fixed number of provider calls inside a fixed window, across all the client's re-sends). Not
   * retried: the task stops where it is, with everything done so far kept.
   */
  | "model_retries_exhausted"
  | "failed";

/**
 * Why the model didn't answer, as a class only — for whoever is debugging, never shown to a user by
 * PawOS's own clients unless they ask for debug output. It carries no key, no prompt and no
 * provider text: just "it timed out", "it said HTTP 429", "it answered with nothing".
 */
export type ModelFailureDetail = "model_timeout" | "model_empty_reply" | "model_unusable_reply" | "model_reply_truncated" | `model_http_${number}`;

export class WebChatError extends Error {
  constructor(
    readonly code: WebChatFailureCode,
    message: string,
    readonly status: number,
    readonly detail?: ModelFailureDetail,
    /** How long to wait before sending the same request again (the provider's suggestion, or PawOS's backoff). */
    readonly retryAfterMs?: number
  ) {
    super(message);
  }
}
