import {
  ACCEPTABLE_USE_CORE_SECTION,
  CHANGES_SECTION,
  CONTACT_SECTION,
  DATA_HANDLING_SECTION,
  DEFINITIONS_SECTION,
  ENTITY_NAME,
  PAYMENTS_SECTION,
  SEVERABILITY_SECTION,
  TERMINATION_SECTION,
} from "./legal/sections";

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDoc = {
  slug: string;
  title: string;
  category: "Core" | "Payments" | "Safety" | "Security" | "Intellectual Property" | "Enterprise" | "Compliance";
  summary: string;
  sections: LegalSection[];
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    category: "Core",
    summary: "What data PawOS collects, how it's stored, and your rights over it.",
    sections: [
      DEFINITIONS_SECTION,
      {
        heading: "What we collect",
        paragraphs: [
          "Account information (email, authentication method) needed to operate your account. Content you explicitly share into an Organization Workspace. Diagnostic reports you choose to submit through the in-app reporting tool. Billing records for completed transactions.",
          "We do not collect your local files, companion memory, or conversation history unless you explicitly share them into an Organization Workspace or submit them as part of a diagnostic report.",
        ],
      },
      DATA_HANDLING_SECTION,
      {
        heading: "Third-party processors",
        paragraphs: [
          "AI reasoning requests are routed through third-party AI providers to generate responses. Payment processing is handled by a third-party payment processor. Organization data is hosted with Supabase. A complete list of processors is maintained internally and available on request while a public sub-processor list is being finalized.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "Depending on your jurisdiction, you may have rights to access, correct, export, or delete your personal data. Requests can be made via the Support page; jurisdiction-specific rights language (e.g. GDPR, CCPA) will be finalized by counsel and added here.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "terms",
    title: "Terms of Service",
    category: "Core",
    summary: "The agreement governing your use of PawOS.",
    sections: [
      DEFINITIONS_SECTION,
      {
        heading: "Acceptance of terms",
        paragraphs: [
          `By installing or using PawOS, you agree to these Terms of Service and to ${ENTITY_NAME}'s other policies referenced here.`,
        ],
      },
      {
        heading: "The service",
        paragraphs: [
          "PawOS is a desktop AI companion application that can, with your confirmation, take real actions on your device and connected accounts. You are responsible for reviewing confirmation prompts before approving actions, and for the consequences of actions you approve.",
        ],
      },
      PAYMENTS_SECTION,
      ACCEPTABLE_USE_CORE_SECTION,
      {
        heading: "Disclaimers",
        paragraphs: [
          "PawOS is provided \"as is.\" We do not guarantee that any AI-generated output, plan, or action will be error-free, and you remain responsible for reviewing and confirming actions before they run, consistent with PawOS's own confirmation-gate design.",
        ],
      },
      {
        heading: "Limitation of liability",
        paragraphs: [
          "To the maximum extent permitted by law, our liability for any claim arising from your use of PawOS is limited to the amount you paid us in the twelve months preceding the claim. Exact limitation-of-liability language will be finalized by counsel for enforceability in each relevant jurisdiction.",
        ],
      },
      TERMINATION_SECTION,
      SEVERABILITY_SECTION,
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    category: "Core",
    summary: "How pawos.app uses cookies and similar technologies.",
    sections: [
      {
        heading: "What we use cookies for",
        paragraphs: [
          "pawos.app uses strictly necessary cookies to operate checkout and authentication flows. Analytics cookies, if enabled, are described in our Analytics integration and are subject to your consent choice via the cookie consent banner.",
        ],
      },
      {
        heading: "Your choices",
        paragraphs: [
          "You can decline non-essential cookies via the consent banner shown on your first visit, and change your choice at any time through your browser settings.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "refund-policy",
    title: "Refund Policy",
    category: "Payments",
    summary: "How refunds work for subscriptions and Autonomous Engineering Tasks.",
    sections: [
      PAYMENTS_SECTION,
      {
        heading: "Subscription refunds",
        paragraphs: [
          "Monthly subscriptions can be cancelled at any time to stop future billing; cancellation does not retroactively refund the current billing period except where required by law or granted at our discretion for billing errors.",
        ],
      },
      {
        heading: "Autonomous Engineering Task billing errors",
        paragraphs: [
          "Because Autonomous Engineering Tasks are only billed on genuine completion, billing disputes are expected to be rare. If you believe a task was billed in error — for instance, billed despite failing, being cancelled, or being denied approval — contact support with the run's ID for review and correction.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    category: "Safety",
    summary: "What you agree not to do with PawOS.",
    sections: [
      ACCEPTABLE_USE_CORE_SECTION,
      {
        heading: "Prohibited uses",
        paragraphs: [
          "Using PawOS to develop or operate malware, to conduct unauthorized intrusion or denial-of-service against systems you don't own or have permission to test, to violate the acceptable-use terms of any third-party provider PawOS connects to (hosting providers, ticket trackers, source control systems), or to circumvent confirmation gates, approval policies, or billing logic.",
        ],
      },
      {
        heading: "Enforcement",
        paragraphs: [
          "Violations may result in suspension or termination of access, consistent with our Terms of Service.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "safety-guidelines",
    title: "Safety Guidelines",
    category: "Safety",
    summary: "Practical guidance for using PawOS's execution capabilities responsibly.",
    sections: [
      {
        heading: "Review before confirming",
        paragraphs: [
          "PawOS shows a plan and asks for confirmation before destructive or production-impacting actions. Read what's actually being proposed before confirming — the gate only protects you if you use it.",
        ],
      },
      {
        heading: "Scope your approval policies",
        paragraphs: [
          "For Organization Workspaces, configure approval policies for genuinely risky action types (production deploys, credential access) rather than everything, to keep approvals meaningful rather than routine.",
        ],
      },
      {
        heading: "Use consent gates for recording",
        paragraphs: [
          "Communication capture requires your explicit consent and, where applicable, the consent of other participants under your jurisdiction's recording-consent laws. You are responsible for obtaining consent from other participants where required.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "responsible-ai-usage",
    title: "Responsible AI Usage",
    category: "Safety",
    summary: "Our commitments and your responsibilities around AI-generated actions.",
    sections: [
      {
        heading: "Our commitments",
        paragraphs: [
          "PawOS is designed to report honestly on task outcomes, never fabricate completion of unfinished work, and gate destructive or production-impacting actions behind explicit confirmation. See our AI Safety article and Security documentation for the concrete mechanisms behind these commitments.",
        ],
      },
      {
        heading: "Your responsibilities",
        paragraphs: [
          "You remain responsible for reviewing AI-proposed plans and actions before confirming them, for the accuracy of decisions made based on AI-generated content, and for compliance with any professional, legal, or organizational obligations that apply to your use of AI-assisted work (for example, code review requirements before merging an Autonomous Engineering Task's pull request).",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "security-policy",
    title: "Security Policy",
    category: "Security",
    summary: "Our approach to securing PawOS and your data.",
    sections: [
      {
        heading: "Overview",
        paragraphs: [
          "See our Security documentation page for the full technical overview of encryption, authentication, runtime isolation, and credential storage. This policy covers our commitments and process, not implementation detail.",
        ],
      },
      {
        heading: "Credential handling",
        paragraphs: [
          "Organization-shared infrastructure credentials are stored in an encrypted vault, never in plain text. Individual-use infrastructure connectors rely on your own already-authenticated CLI/API sessions rather than PawOS storing your cloud credentials.",
        ],
      },
      {
        heading: "Reporting a vulnerability",
        paragraphs: [
          "See our Vulnerability Disclosure Policy for how to responsibly report a security issue.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "vulnerability-disclosure-policy",
    title: "Vulnerability Disclosure Policy",
    category: "Security",
    summary: "How to responsibly report a security vulnerability.",
    sections: [
      {
        heading: "Scope",
        paragraphs: [
          "This policy covers the PawOS desktop application, pawos.app, and associated backend services referenced in our Security Policy.",
        ],
      },
      {
        heading: "How to report",
        paragraphs: [
          "Open a GitHub Issue marked confidential/security on the PawOS repository, or use a dedicated security contact channel once published on our Support page. Please include steps to reproduce and avoid public disclosure until we've had a reasonable opportunity to address the issue.",
        ],
      },
      {
        heading: "Safe harbor",
        paragraphs: [
          "Good-faith security research conducted in accordance with this policy will not result in legal action from us, provided it avoids privacy violations, data destruction, and service disruption.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "data-processing-agreement",
    title: "Data Processing Agreement",
    category: "Compliance",
    summary: "Terms governing our processing of personal data on behalf of Organization customers.",
    sections: [
      DEFINITIONS_SECTION,
      {
        heading: "Roles",
        paragraphs: [
          `For Organization Workspace data, ${ENTITY_NAME} acts as a data processor on behalf of the Organization, which acts as data controller for its members' personal data, in each case subject to applicable data protection law.`,
        ],
      },
      DATA_HANDLING_SECTION,
      {
        heading: "Sub-processors",
        paragraphs: [
          "We use sub-processors for infrastructure (Supabase), AI reasoning, and payment processing. A complete sub-processor list is maintained internally and will be published here as this document is finalized with counsel.",
        ],
      },
      {
        heading: "Security measures",
        paragraphs: [
          "Row-level security scoping, encrypted credential storage, and audit logging as described in our Security Policy apply to Organization Workspace data processed under this agreement.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "enterprise-terms",
    title: "Enterprise Terms",
    category: "Enterprise",
    summary: "Additional terms for Enterprise customers.",
    sections: [
      DEFINITIONS_SECTION,
      {
        heading: "Relationship to standard Terms",
        paragraphs: [
          "These Enterprise Terms supplement, and in the case of conflict take precedence over, our standard Terms of Service for customers on an Enterprise plan.",
        ],
      },
      {
        heading: "Seats and billing",
        paragraphs: [
          "Enterprise plans are billed per seat, starting at 20 seats, at the rate on our Pricing page or as separately negotiated. Custom Autonomous Engineering Task volume pricing may be agreed in a separate order form.",
        ],
      },
      {
        heading: "Support commitments",
        paragraphs: [
          "Enterprise customers receive dedicated support as described on our Enterprise page; specific SLA terms (response time commitments) will be finalized per-customer and referenced here once standardized.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "licensing",
    title: "Licensing",
    category: "Intellectual Property",
    summary: "The license under which PawOS is provided to you.",
    sections: [
      {
        heading: "Application license",
        paragraphs: [
          "PawOS grants you a limited, non-exclusive, non-transferable license to install and use the application for its intended purpose, subject to these terms and your subscription tier's entitlements. This license does not grant ownership of PawOS itself.",
        ],
      },
      {
        heading: "Open source components",
        paragraphs: [
          "PawOS incorporates open source software under their respective licenses — see Third-Party Licenses and Open Source Notices for the complete attribution list.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "third-party-licenses",
    title: "Third-Party Licenses",
    category: "Intellectual Property",
    summary: "Licenses for third-party software incorporated into PawOS.",
    sections: [
      {
        heading: "Overview",
        paragraphs: [
          "PawOS is built with Electron, React, three.js, and numerous other open source packages, each under its own license (predominantly MIT, Apache 2.0, and BSD-style licenses).",
        ],
      },
      {
        heading: "Full attribution",
        paragraphs: [
          "A complete, generated list of every dependency and its license is maintained alongside the application build and will be published here and/or bundled with installers once the first public release ships, rather than hand-maintained and risking staleness.",
        ],
      },
      CONTACT_SECTION,
    ],
  },
  {
    slug: "open-source-notices",
    title: "Open Source Notices",
    category: "Intellectual Property",
    summary: "Required notices for open source components.",
    sections: [
      {
        heading: "Notices",
        paragraphs: [
          "Where an open source license requires a specific notice to be reproduced (for example, an MIT copyright notice or an Apache 2.0 NOTICE file), that notice will be included in this document and/or bundled with installers, generated automatically from the project's real dependency tree rather than compiled by hand.",
        ],
      },
      CONTACT_SECTION,
    ],
  },
  {
    slug: "trademark-policy",
    title: "Trademark Policy",
    category: "Intellectual Property",
    summary: "How the PawOS name and marks may and may not be used.",
    sections: [
      {
        heading: "Our marks",
        paragraphs: [
          `"PawOS" and associated logos are trademarks of ${ENTITY_NAME}. You may refer to PawOS by name to describe genuine compatibility or integration, but may not use our marks in a way that implies endorsement, sponsorship, or affiliation without permission.`,
        ],
      },
      {
        heading: "Requesting permission",
        paragraphs: ["For uses beyond fair, descriptive reference, contact us via the Support page before use."],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "brand-guidelines",
    title: "Brand Guidelines",
    category: "Intellectual Property",
    summary: "How to represent the PawOS brand correctly.",
    sections: [
      {
        heading: "Naming",
        paragraphs: ['Write "PawOS" as one word with a capital P and capital OS — not "Paw OS," "pawOS," or "Pawos."'],
      },
      {
        heading: "Logo usage",
        paragraphs: [
          "Do not distort, recolor, or add effects to the PawOS logo. Maintain clear space around it equivalent to at least the height of the logomark. A full downloadable brand asset kit will be published here alongside the first public release.",
        ],
      },
      CONTACT_SECTION,
    ],
  },
  {
    slug: "copyright-notice",
    title: "Copyright Notice",
    category: "Intellectual Property",
    summary: "Copyright ownership of PawOS content and software.",
    sections: [
      {
        heading: "Notice",
        paragraphs: [
          `© ${new Date().getFullYear()} ${ENTITY_NAME}. All rights reserved. PawOS's software, documentation, and this website's original content may not be reproduced, distributed, or used to train machine learning models without prior written permission, except as permitted by the open source licenses of individually-licensed components.`,
        ],
      },
      {
        heading: "Reporting infringement",
        paragraphs: [
          "If you believe your copyrighted work has been used on pawos.app or in PawOS without authorization, contact us via the Support page with details sufficient to identify the material.",
        ],
      },
      CONTACT_SECTION,
    ],
  },
  {
    slug: "compliance-information",
    title: "Compliance Information",
    category: "Compliance",
    summary: "Our current compliance posture, stated honestly.",
    sections: [
      {
        heading: "Current status",
        paragraphs: [
          "PawOS is an early-stage product. We do not currently hold formal compliance certifications (such as SOC 2 or ISO 27001) — we'd rather state that plainly than imply a certification that doesn't exist. Our actual security practices (encrypted credential storage, row-level security, audit logging, approval gating) are documented in full on our Security page regardless of certification status.",
        ],
      },
      {
        heading: "Roadmap",
        paragraphs: [
          "As Enterprise adoption grows, we expect to pursue relevant certifications and will update this page with real, verifiable status rather than a projected timeline.",
        ],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
];

export function getLegalDocBySlug(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}
