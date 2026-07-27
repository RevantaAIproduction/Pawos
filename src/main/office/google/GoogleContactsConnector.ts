import type { ConnectorResult, ContactRef, ContactsProviderConnector } from '../../../shared/office/OfficeTypes';

const PEOPLE_API = 'https://people.googleapis.com/v1';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers';

type Person = {
  resourceName: string;
  names?: { displayName?: string }[];
  emailAddresses?: { value: string }[];
  phoneNumbers?: { value: string }[];
};

function toContactRef(p: Person): ContactRef {
  return {
    id: p.resourceName,
    name: p.names?.[0]?.displayName ?? '(no name)',
    emails: (p.emailAddresses ?? []).map((e) => e.value),
    phones: (p.phoneNumbers ?? []).map((n) => n.value),
  };
}

/** Real Google People API (Contacts) connector — plain fetch + Bearer token. */
export class GoogleContactsConnector implements ContactsProviderConnector {
  readonly id = 'googleContacts' as const;
  readonly displayName = 'Google Contacts';

  constructor(private accessToken: string | undefined) {}

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Google Contacts is not connected. Connect Google Workspace to enable it.' };
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json' };
  }

  async listContacts(query?: string): Promise<ConnectorResult<{ contacts: ContactRef[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      if (query) {
        const params = new URLSearchParams({ query, readMask: PERSON_FIELDS });
        const res = await fetch(`${PEOPLE_API}/people:searchContacts?${params.toString()}`, { headers: this.headers() });
        if (!res.ok) return { ok: false, reason: `Google Contacts API returned ${res.status}` };
        const data = (await res.json()) as { results?: { person: Person }[] };
        return { ok: true, contacts: (data.results ?? []).map((r) => toContactRef(r.person)) };
      }
      const params = new URLSearchParams({ personFields: PERSON_FIELDS, pageSize: '100' });
      const res = await fetch(`${PEOPLE_API}/people/me/connections?${params.toString()}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `Google Contacts API returned ${res.status}` };
      const data = (await res.json()) as { connections?: Person[] };
      return { ok: true, contacts: (data.connections ?? []).map(toContactRef) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Google Contacts: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
