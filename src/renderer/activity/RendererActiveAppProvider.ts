export interface ActiveAppProvider {
  getActiveApp(): string;
}

export class FallbackActiveAppProvider implements ActiveAppProvider {
  // MVP fallback: we don't have native active-app identity in this repo yet.
  // Privacy rule: provide only app identity if available later.
  getActiveApp(): string {
    return 'unknown';
  }
}

