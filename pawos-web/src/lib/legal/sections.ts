/**
 * Reusable legal-document building blocks. Every PawOS legal page is
 * "Draft — Pending Legal Review": original text drafted from common SaaS/AI
 * industry practice, not copied from any other company's documents, and
 * deliberately structured so jurisdiction, entity name, and effective dates
 * can be filled in by counsel without rewriting the document from scratch.
 */

export const ENTITY_PLACEHOLDER =
  "[Legal entity name and jurisdiction to be finalized by counsel — operated in connection with the PawOS product]";

export const DEFINITIONS_SECTION = {
  heading: "Definitions",
  paragraphs: [
    '"PawOS" means the desktop application, this website, and related services described at pawos.app.',
    '"You" or "User" means the individual or organization using PawOS.',
    '"Organization Workspace" means a shared Team or Enterprise environment scoped to a verified email domain.',
    '"Autonomous Engineering Task" means one completed cycle of investigation, planning, implementation, testing, and delivery for a real engineering ticket, as described in our Autonomous Ticket Resolution documentation.',
    `"We," "us," or "our" refers to ${ENTITY_PLACEHOLDER}.`,
  ],
};

export const CONTACT_SECTION = {
  heading: "Contact",
  paragraphs: ["Questions about this document can be raised at legal@revantaai.com."],
};

export const CHANGES_SECTION = {
  heading: "Changes to this document",
  paragraphs: [
    "We may update this document as PawOS's features, legal review, or applicable law change. Material changes will be reflected in the Changelog and, where required by law, communicated directly to affected users. Continued use of PawOS after a change takes effect constitutes acceptance of the revised document.",
  ],
};

export const DATA_HANDLING_SECTION = {
  heading: "How data is handled",
  paragraphs: [
    "Most PawOS data — companion memory, conversation history, workspace memory — is stored locally on your device and is not transmitted to us except where you explicitly share it into an Organization Workspace, or where it must pass through a third-party AI reasoning provider to generate a response.",
    "Organization Workspace data is stored with our infrastructure provider (Supabase) with row-level security scoping every record to the requesting organization, so one organization's data is never visible to another.",
    "See our Privacy Policy for the complete, authoritative description of data handling.",
  ],
};

export const PAYMENTS_SECTION = {
  heading: "Payments and billing",
  paragraphs: [
    "Subscription plans are billed on a recurring monthly basis at the rate shown on our Pricing page at the time of purchase or renewal. Autonomous Engineering Tasks are billed separately, only upon genuine completion — never for a failed, cancelled, retry-limit-reached, or approval-denied run.",
    "Payment processing is handled by a third-party payment processor; we do not store your full payment card details ourselves.",
  ],
};

export const ACCEPTABLE_USE_CORE_SECTION = {
  heading: "Acceptable use",
  paragraphs: [
    "You agree not to use PawOS to: violate applicable law; attempt to gain unauthorized access to systems or data; use PawOS's execution capabilities to cause harm to yourself, others, or third-party infrastructure; or attempt to circumvent PawOS's confirmation gates, approval policies, or safety mechanisms with the intent of causing unreviewed, high-risk actions to run.",
    "Full detail lives in our dedicated Acceptable Use Policy.",
  ],
};

export const TERMINATION_SECTION = {
  heading: "Termination",
  paragraphs: [
    "You may stop using PawOS and cancel your subscription at any time from Settings → Billing. We may suspend or terminate access for violation of this document, non-payment, or as required by law, with notice where reasonably practicable.",
  ],
};

export const SEVERABILITY_SECTION = {
  heading: "Severability",
  paragraphs: [
    "If any provision of this document is found unenforceable, the remaining provisions remain in full effect, and the unenforceable provision will be interpreted to best reflect its original intent within the bounds of applicable law.",
  ],
};
