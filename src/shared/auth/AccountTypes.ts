/** Profile fields returned by Google's userinfo endpoint after a real OAuth sign-in. */
export type GoogleProfile = { sub: string; name: string; email: string; picture?: string };
