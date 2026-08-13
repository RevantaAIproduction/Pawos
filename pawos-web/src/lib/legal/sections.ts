/**
 * Shared building blocks reused across PawOS's legal documents so that
 * definitions, governing law, contact routing, and regional privacy-rights
 * language stay word-for-word identical everywhere they appear. Edit here,
 * not in individual documents in legalContent.ts, to keep every document
 * internally consistent.
 */

export const ENTITY_NAME = "Revanta AI";

/** The one place the entity's registration facts are stated. Revanta AI is
 * a business registered under India's Udyam (MSME) registration scheme,
 * based in Hyderabad, Telangana, India. It is not currently registered for
 * Goods and Services Tax (GST); no GST is charged on invoices as a result,
 * and this document will be updated if that changes. No claim is made here
 * about a specific corporate form (proprietorship, partnership, LLP, etc.)
 * beyond what Udyam registration itself establishes. */
export const ENTITY_DESCRIPTOR =
  "Revanta AI, a business registered under India's Udyam (Micro, Small & Medium Enterprises) registration scheme, based in Hyderabad, Telangana, India";

export const LAST_UPDATED = "28 July 2026";

export const DEFINITIONS_SECTION = {
  heading: "Definitions",
  paragraphs: [
    '"PawOS" means the PawOS desktop application, the pawos.revantaai.com website, and the backend services (authentication, billing, Organization Workspace storage, AI reasoning routing) that support them.',
    '"You" or "User" means the individual or organization using PawOS.',
    `"We," "us," or "our" refers to ${ENTITY_NAME}.`,
    '"Account" means a PawOS account created via email/password or Google sign-in, authenticated through our authentication provider (Supabase Auth).',
    '"Self-Service Subscription" means a recurring Paw Go (free), Pro, Pro Max, Team, or Enterprise subscription that you or your organization activate, upgrade, downgrade, or cancel directly inside PawOS without needing to contact sales.',
    '"Seat" means one licensed member of a Team or Enterprise Organization Workspace. Team seats are billed as either a Standard or Premium Seat Type at the rate shown on our Pricing page; Enterprise seats are billed at a uniform base rate plus usage.',
    '"Organization Workspace" (or "Organization") means a shared Team or Enterprise environment scoped to a verified email domain, with its own members, roles, shared credit pool, and audit log.',
    '"AI Credits" and "Ticket Balance" mean the prepaid usage mechanisms that fund, respectively, general AI conversation/reasoning usage on paid individual tiers and the Autonomous Ticket System. Both are prepaid wallets, never a monthly allowance that expires unused.',
    '"Autonomous Ticket System" (or "Autonomous Engineering Task") means PawOS\'s workflow for autonomously investigating, planning, implementing, testing, and delivering a real engineering ticket, billed only on genuine completion (a real pull request opened and the originating ticket updated) — never for a failed, cancelled, retry-limit-reached, or approval-denied run.',
    '"Companion Runtime" means PawOS\'s 3D animated companion feature (default character "Paw," or a companion you upload or customize), including its voice, personality, and memory features.',
    '"Browser Automation" and "Desktop Automation" mean PawOS runtimes that, with your confirmation, control a real browser session or take actions on your device (files, applications, processes, terminals) on your behalf.',
    '"Connector" means an integration (for example, Google Workspace, GitHub, GitLab, Linear, Jira, or a hosting/cloud provider) that you explicitly authorize, typically via OAuth or an API token you supply, to let PawOS take actions on a connected third-party account.',
    '"Confirmation Gate" means the approval prompt PawOS shows before a destructive or production-impacting action runs, requiring your explicit confirmation before it proceeds.',
  ],
};

export const GOVERNING_LAW_SECTION = {
  heading: "Governing law and disputes",
  paragraphs: [
    `This document is governed by the laws of India, without regard to conflict-of-law principles. Subject to the paragraph below, you and ${ENTITY_NAME} submit to the exclusive jurisdiction of the courts at Hyderabad, Telangana, India for any dispute arising out of or relating to this document or your use of PawOS.`,
    "If you are located outside India, nothing in this document limits any mandatory consumer-protection or data-protection right you hold under the law of your own country or region that cannot lawfully be waived by contract — including rights available to residents of the European Union/European Economic Area (including Finland), Australia, and the United States described in our Privacy Policy. Where such a mandatory right conflicts with a provision of this document, the mandatory right controls solely to the extent of the conflict, and the remainder of this document remains in effect.",
  ],
};

export const GRIEVANCE_OFFICER_SECTION = {
  heading: "Grievance Officer",
  paragraphs: [
    `${ENTITY_NAME} designates a Grievance Officer to receive and act on complaints about this document or the handling of your personal data, consistent with the grievance redressal expected of a data fiduciary under India's Digital Personal Data Protection Act, 2023.`,
    "Grievance Officer, PawOS — reachable at privacy@revantaai.com (privacy and data-protection matters) or legal@revantaai.com (other legal complaints). We aim to acknowledge and address grievances as promptly as we reasonably can. This role-based contact is intentionally not tied to one named individual, so it stays valid even as our team changes.",
  ],
};

export const REGIONAL_PRIVACY_RIGHTS_SECTION = {
  heading: "Your privacy rights by region",
  paragraphs: [
    "The rights below apply regardless of which plan or Organization you use PawOS under, and are in addition to, not a replacement for, the general description of your rights elsewhere in this document.",
  ],
};

export const REGIONAL_PRIVACY_RIGHTS_INDIA = {
  heading: "India — Digital Personal Data Protection Act, 2023",
  paragraphs: [
    "If you are located in India, you have the right to obtain a summary of the personal data we process about you and the processing activities carried out, to correct, complete, and update your personal data, to have it erased once it is no longer needed for the purpose it was collected for (subject to our legal retention obligations, for example completed billing records), to withdraw consent at any time with the same ease with which it was given, to nominate another individual to exercise your rights in the event of your death or incapacity, and to file a complaint with our Grievance Officer and, if unresolved, with the Data Protection Board of India.",
    "Withdrawing consent does not affect the lawfulness of processing carried out before withdrawal, and may mean a feature that depends on that processing (for example, sharing data into an Organization Workspace) is no longer available to you.",
  ],
};

export const REGIONAL_PRIVACY_RIGHTS_EU = {
  heading: "European Union / European Economic Area, including Finland — GDPR",
  paragraphs: [
    "If you are located in the EU/EEA, the GDPR applies to our processing of your personal data because we offer PawOS to you. We process your personal data on the legal bases of contract performance (operating your account and subscription), legitimate interest (security, fraud prevention, and improving PawOS), and consent (for example, optional analytics or communications). You have the right to request access to, rectification of, or erasure of your personal data, to request that we restrict processing, to request a copy of the data you provided to us, and to object to processing based on legitimate interest. We handle these requests manually on a case-by-case basis at privacy@revantaai.com; we do not yet offer a self-service export or deletion tool inside PawOS itself.",
    "Personal data is transferred to and processed in India, where we are based, and in the other countries where our sub-processors operate. We have not executed Standard Contractual Clauses or another formal Article 46 transfer mechanism with every sub-processor as of this writing; we rely instead on each sub-processor's own standard data-protection terms.",
    `${ENTITY_NAME} has not appointed a representative in the EU under Article 27 GDPR. EU/EEA data subjects can direct any GDPR request to privacy@revantaai.com and retain the right to lodge a complaint with their local supervisory authority regardless — for users in Finland, the Office of the Data Protection Ombudsman (Tietosuojavaltuutetun toimisto).`,
  ],
};

export const REGIONAL_PRIVACY_RIGHTS_AUSTRALIA = {
  heading: "Australia — Privacy Act 1988",
  paragraphs: [
    `Given ${ENTITY_NAME}'s current size, we are likely a "small business operator" as defined by the Privacy Act 1988 (Cth), meaning the Act's Australian Privacy Principles (APPs) may not apply to us as a strict legal obligation. We have not built the specific mechanisms the APPs contemplate (for example, a formal APP-compliant collection notice regime).`,
    "Regardless, if you are in Australia, you can ask us what personal information we hold about you and request that we correct it by writing to privacy@revantaai.com, and we will respond as a matter of practice. You are also free to raise a concern with the Office of the Australian Information Commissioner (OAIC), though as a likely small business operator we may fall outside the Privacy Act's direct enforcement scope.",
  ],
};

export const REGIONAL_PRIVACY_RIGHTS_US = {
  heading: "United States",
  paragraphs: [
    "There is no single federal privacy law of general application in the United States, and a number of states have each enacted their own comprehensive privacy law (for example, California's CCPA/CPRA) with different thresholds and rights. We have not determined which, if any, of these state laws currently apply to us, and this document does not claim compliance with any specific one.",
    "As a matter of current practice, available to every PawOS user in the United States regardless of state: you can email privacy@revantaai.com to ask what personal data we hold about you, to request that we correct it, or to request deletion of your account and associated data, and we will act on that request manually. We do not sell personal data, and we do not share personal data with third parties for cross-context behavioral advertising.",
  ],
};

export const CONTACT_SECTION = {
  heading: "Contact",
  paragraphs: [
    "General questions about this document: legal@revantaai.com. Privacy and data-protection requests: privacy@revantaai.com. Security reports: security@revantaai.com, following our Vulnerability Disclosure Policy. See also our Grievance Officer contact above where this document includes one.",
  ],
};

export const CHANGES_SECTION = {
  heading: "Changes to this document",
  paragraphs: [
    "We may revise this document as PawOS's features or applicable law change. The date at the top of this page reflects the version currently in effect. Where a change is material, we will note it in our Changelog and, where required by law, notify affected users directly (for example, by email or an in-app notice) before the change takes effect. Continuing to use PawOS after a revised document takes effect constitutes acceptance of it.",
  ],
};

export const DATA_HANDLING_SECTION = {
  heading: "How your data is handled",
  paragraphs: [
    "Most PawOS data — companion memory, conversation history, local Workspace Intelligence, and project analysis — is stored locally on your device and is never transmitted to us, except where it must pass through a third-party AI provider to generate a response, or where you explicitly share it into an Organization Workspace.",
    "Organization Workspace data is hosted with our infrastructure provider, Supabase, with row-level security scoping every record to the requesting organization so that one organization's data is never visible to another, or to us, outside of what is necessary to operate the service and respond to a valid legal or support request.",
  ],
};

export const SUBPROCESSORS_SECTION = {
  heading: "Sub-processors",
  paragraphs: [
    "We rely on the following categories of sub-processor to operate PawOS: cloud database and authentication infrastructure (Supabase); payment processing (Razorpay); email delivery for account and billing notifications; and third-party AI providers that generate reasoning responses when you use an AI-powered feature. Each is bound by its own data-processing terms with us, and none is authorized to use your data for purposes beyond providing its service to us.",
    "We will notify Organization customers of a material change in sub-processor (for example, a new AI provider) via the Changelog or direct notice, consistent with the Changes to this document section above.",
  ],
};

export const PAYMENTS_SECTION = {
  heading: "Payments and billing",
  paragraphs: [
    "Paw Go is free. Pro, Pro Max, Team, and Enterprise are Self-Service Subscriptions: you activate, upgrade, downgrade, or cancel them directly inside PawOS, billed on a recurring monthly basis at the rate shown on our Pricing page at the time of purchase or renewal. Team seats are billed per Seat at the Standard or Premium rate you choose for each member; Enterprise seats are billed at a uniform base rate (20-seat minimum) plus Autonomous Ticket System usage at pass-through provider rates.",
    "The Autonomous Ticket System is billed separately from any subscription, through a prepaid Ticket Balance: you add funds in any amount (subject to a stated minimum) and a real dollar amount is deducted only once a ticket is genuinely completed — a real pull request opened and the originating ticket updated. A ticket that fails, is cancelled, hits a retry limit, or is denied approval never deducts anything, and an unused Ticket Balance never expires.",
    "All prices are shown in and billed in US Dollars (USD) unless our Pricing page states otherwise for your region. Payment processing is handled by Razorpay, our third-party payment processor; we do not ourselves store your full card or bank account details. Revanta AI is not currently registered for Goods and Services Tax (GST) in India, so GST is not charged on invoices; this document will be updated if that changes.",
  ],
};

export const REFUND_CORE_SECTION = {
  heading: "How refunds work",
  paragraphs: [
    "Self-Service Subscriptions can be cancelled at any time from Settings → Billing. Cancelling stops future billing at the end of the current billing period; it does not retroactively refund the period already paid for, except where required by applicable consumer-protection law or granted at our discretion to correct a genuine billing error (for example, a duplicate charge).",
    "Ticket Balance funds are a prepaid wallet, not a subscription allowance, so there is nothing to \"expire\" or refund on a schedule — unused funds simply remain on the account. If a ticket is billed despite failing, being cancelled, hitting a retry limit, or being denied approval, that is a billing error: contact billing support with the run's ID and we will correct it, crediting the Ticket Balance or refunding the charge.",
    "Approved refunds are processed to your original payment method as promptly as we reasonably can; the exact time funds take to appear depends on your card issuer's or bank's own processing time, which we do not control.",
  ],
};

export const ACCEPTABLE_USE_CORE_SECTION = {
  heading: "Acceptable use",
  paragraphs: [
    "You agree not to use PawOS to: violate applicable law; gain or attempt to gain unauthorized access to systems, accounts, or data; use PawOS's Browser Automation, Desktop Automation, or Connector capabilities against systems or accounts you don't own or don't have explicit permission to access; exceed or circumvent the acceptable-use terms of any third-party service a Connector connects to (a hosting provider, source-control host, or ticket tracker, for example); or attempt to disable, bypass, or trick PawOS's Confirmation Gates, Organization approval policies, or billing logic.",
    "You are responsible for the Connectors you authorize and the credentials or OAuth grants behind them, for reviewing every Confirmation Gate before approving it, and for the consequences of actions you confirm.",
    "Full detail lives in our Acceptable Use Policy.",
  ],
};

export const TERMINATION_SECTION = {
  heading: "Termination",
  paragraphs: [
    "You may stop using PawOS and cancel any Self-Service Subscription at any time from Settings → Billing. We may suspend or terminate your access for violating this document, for non-payment, or as required by law, giving notice where reasonably practicable given the circumstances. On termination, your right to use PawOS ends immediately; locally stored data on your device is unaffected, and Organization Workspace data is retained or deleted consistent with our Privacy Policy and any separate agreement with your Organization.",
  ],
};

export const SEVERABILITY_SECTION = {
  heading: "Severability",
  paragraphs: [
    "If a court or other competent authority finds any provision of this document unenforceable, the remaining provisions remain in full effect, and the unenforceable provision will be read narrowly so as to give effect to its original intent to the fullest extent the law allows.",
  ],
};
