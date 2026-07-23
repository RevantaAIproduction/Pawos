/** Real Revanta AI contact channels — provided directly, not fabricated. */
export const CONTACT_EMAILS = {
  support: "support@revantaai.com",
  hello: "hello@revantaai.com",
  sales: "sales@revantaai.com",
  enterprise: "enterprise@revantaai.com",
  security: "security@revantaai.com",
  privacy: "privacy@revantaai.com",
  legal: "legal@revantaai.com",
} as const;

export type ContactEmailKey = keyof typeof CONTACT_EMAILS;

export function mailto(key: ContactEmailKey, subject?: string): string {
  const address = CONTACT_EMAILS[key];
  return subject ? `mailto:${address}?subject=${encodeURIComponent(subject)}` : `mailto:${address}`;
}
