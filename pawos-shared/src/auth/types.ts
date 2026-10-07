/** The session a signed-in PawOS client holds, and the ways signing in can fail. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, in seconds since the epoch. */
  expiresAt: number;
  email: string | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** There is no usable session: nobody is signed in, or the session ended. */
export class AuthRequiredError extends Error {}
/** PawOS refused the credentials (a spent or expired code, a session it won't renew). */
export class AuthRejectedError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null
  ) {
    super(message);
  }
}
/** PawOS could not be reached or failed; nothing is known about the credentials. */
export class AuthUnavailableError extends Error {}
