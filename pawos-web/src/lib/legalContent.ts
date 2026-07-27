import {
  ACCEPTABLE_USE_CORE_SECTION,
  CHANGES_SECTION,
  CONTACT_SECTION,
  DATA_HANDLING_SECTION,
  DEFINITIONS_SECTION,
  ENTITY_DESCRIPTOR,
  ENTITY_NAME,
  GOVERNING_LAW_SECTION,
  GRIEVANCE_OFFICER_SECTION,
  LAST_UPDATED,
  PAYMENTS_SECTION,
  REFUND_CORE_SECTION,
  REGIONAL_PRIVACY_RIGHTS_AUSTRALIA,
  REGIONAL_PRIVACY_RIGHTS_EU,
  REGIONAL_PRIVACY_RIGHTS_INDIA,
  REGIONAL_PRIVACY_RIGHTS_SECTION,
  REGIONAL_PRIVACY_RIGHTS_US,
  SEVERABILITY_SECTION,
  SUBPROCESSORS_SECTION,
  TERMINATION_SECTION,
} from "./legal/sections";

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDoc = {
  slug: string;
  title: string;
  category: "Core" | "Payments" | "Safety" | "Security" | "Intellectual Property" | "Enterprise" | "Compliance";
  summary: string;
  lastUpdated: string;
  /** Slugs of other LEGAL_DOCS entries this document cross-references. */
  related: string[];
  sections: LegalSection[];
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    category: "Core",
    summary: "What data PawOS collects, how it's used and stored, and your rights over it in India, the EU/EEA, Australia, and the United States.",
    lastUpdated: LAST_UPDATED,
    related: ["terms", "cookie-policy", "data-processing-agreement", "security-policy"],
    sections: [
      DEFINITIONS_SECTION,
      {
        heading: "Who we are",
        paragraphs: [`This Privacy Policy is issued by ${ENTITY_DESCRIPTOR}, referred to as "we," "us," or "our."`],
      },
      {
        heading: "What we collect",
        paragraphs: [
          "Account information: your email address and authentication method (email/password or Google sign-in), handled through our authentication provider, Supabase Auth.",
          "Content you explicitly share into an Organization Workspace — for example, a shared document, a CRM contact, or a companion configuration.",
          "Diagnostic reports you choose to submit through the in-app bug/feature reporting tool.",
          "Billing records for completed transactions, processed by our payment processor, Razorpay.",
          "Basic technical data from the pawos.revantaai.com website (IP address, browser type, pages visited) for security and analytics purposes, described further in our Cookie Policy.",
          "We do not collect your local files, companion memory, conversation history, or Workspace Intelligence unless you explicitly share them into an Organization Workspace or submit them as part of a diagnostic report. Guest Mode use creates no account and sends us nothing.",
        ],
      },
      DATA_HANDLING_SECTION,
      {
        heading: "How we use your data",
        paragraphs: [
          "To operate your account and authenticate you; to process subscription and Ticket Balance payments; to respond to support requests, grievances, and security reports; to maintain the security and integrity of PawOS (fraud prevention, abuse detection, rate limiting); and to understand aggregated, non-identifying product usage so we can improve PawOS.",
          "We do not use your personal data for automated decision-making that produces legal or similarly significant effects on you, and we do not sell your personal data.",
        ],
      },
      {
        heading: "AI processing",
        paragraphs: [
          "When you use an AI-powered feature, the relevant request content — your message, or the context needed to complete a task — is sent to our third-party AI provider(s) to generate a response, and is handled under that provider's own terms of service, not ours.",
          "We do not use your conversation content to train our own AI models.",
        ],
      },
      SUBPROCESSORS_SECTION,
      {
        heading: "Cookies",
        paragraphs: [
          "The PawOS desktop application does not use browser cookies. The pawos.revantaai.com website uses strictly necessary cookies for authentication and checkout, and optional analytics cookies subject to your consent. See our Cookie Policy for full detail and how to change your choice.",
        ],
      },
      {
        heading: "Data retention",
        paragraphs: [
          "We retain account data for as long as your account is active, plus a reasonable period afterward to handle disputes and comply with legal obligations. Billing and invoice records are retained for the period required by applicable tax and accounting law. Locally stored data (companion memory, conversation history, Workspace Intelligence) is retained on your device under your own control and is deleted when you delete it or uninstall PawOS.",
        ],
      },
      {
        heading: "International data transfers",
        paragraphs: [
          `Personal data we hold is processed in India, where ${ENTITY_NAME} is based, and by sub-processors located in other countries as described above. See the EU/EEA section below for our current position on cross-border transfer safeguards.`,
        ],
      },
      REGIONAL_PRIVACY_RIGHTS_SECTION,
      REGIONAL_PRIVACY_RIGHTS_INDIA,
      REGIONAL_PRIVACY_RIGHTS_EU,
      REGIONAL_PRIVACY_RIGHTS_AUSTRALIA,
      REGIONAL_PRIVACY_RIGHTS_US,
      {
        heading: "Children's privacy",
        paragraphs: [
          "PawOS is not directed at, and is not intended for use by, children under 18. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact privacy@revantaai.com and we will delete it.",
        ],
      },
      GRIEVANCE_OFFICER_SECTION,
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "terms",
    title: "Terms of Service",
    category: "Core",
    summary: "The agreement governing your use of PawOS, including accounts, AI features, Organizations, billing, and acceptable use.",
    lastUpdated: LAST_UPDATED,
    related: ["privacy-policy", "acceptable-use-policy", "refund-policy", "enterprise-terms", "licensing"],
    sections: [
      DEFINITIONS_SECTION,
      {
        heading: "Acceptance of these terms",
        paragraphs: [
          `By creating an account, using Guest Mode, or otherwise installing or using PawOS, you agree to these Terms of Service and to ${ENTITY_NAME}'s other policies referenced here, including our Privacy Policy and Acceptable Use Policy.`,
        ],
      },
      {
        heading: "Eligibility",
        paragraphs: [
          "You must be at least 18 years old, or the age of legal majority in your jurisdiction, to create a PawOS account. If you are using PawOS on behalf of an Organization, you represent that you are authorized to bind that Organization to these terms.",
        ],
      },
      {
        heading: "Accounts and authentication",
        paragraphs: [
          "You can use PawOS in Guest Mode without an account, or create an Account via email/password or Google sign-in. You are responsible for keeping your credentials confidential and for all activity under your Account. Notify us immediately at security@revantaai.com if you suspect unauthorized access.",
        ],
      },
      {
        heading: "The service",
        paragraphs: [
          "PawOS is a desktop AI companion and execution platform. Depending on your plan, it can take real actions on your device (Desktop Automation), a browser session (Browser Automation), and connected third-party accounts (via Connectors you authorize), always behind a Confirmation Gate for destructive or production-impacting actions. You are responsible for reviewing what a Confirmation Gate is proposing before approving it, and for the consequences of actions you approve.",
        ],
      },
      {
        heading: "AI-generated content and output",
        paragraphs: [
          "PawOS's AI features, including the Companion Runtime and the Autonomous Ticket System, generate plans, code, text, and other output using third-party AI providers. This output may be inaccurate or incomplete. You are responsible for reviewing AI-generated output — including any code produced by the Autonomous Ticket System — before relying on it or merging it into your own systems.",
        ],
      },
      {
        heading: "Your content",
        paragraphs: [
          "You retain ownership of the content you provide to PawOS — including uploaded companion models, files you open or create through PawOS, and content you share into an Organization Workspace (\"Your Content\"). You grant us a limited license to host, store, process, and display Your Content solely to provide PawOS to you and, where applicable, to other members of your Organization Workspace.",
          "You are responsible for having the necessary rights to any companion model, file, or other content you upload to or process through PawOS, and for ensuring Your Content does not infringe a third party's rights.",
        ],
      },
      PAYMENTS_SECTION,
      {
        heading: "Team and Enterprise Organizations",
        paragraphs: [
          "A Team or Enterprise Organization Workspace is scoped to a verified email domain; only accounts on that domain may be invited as members. The Organization's Owner and administrators are responsible for managing membership, roles, and approval policies within the Organization, and for their members' compliance with these terms. See our Enterprise Terms for additional provisions applicable to Enterprise customers.",
        ],
      },
      ACCEPTABLE_USE_CORE_SECTION,
      {
        heading: "Connectors and third-party services",
        paragraphs: [
          "PawOS's Connectors let you authorize PawOS to act on third-party services (for example, Google Workspace, GitHub, or a hosting provider) on your behalf. Your use of a connected third-party service remains subject to that service's own terms. We are not responsible for the availability, accuracy, or acts of any third-party service a Connector connects to.",
        ],
      },
      {
        heading: "Disclaimers",
        paragraphs: [
          `PawOS is provided "as is" and "as available," without warranties of any kind, express or implied, except those that cannot be excluded under applicable law. We do not guarantee that any AI-generated output, plan, or action will be error-free, uninterrupted, or fit for a particular purpose, and you remain responsible for reviewing and confirming actions before they run.`,
        ],
      },
      {
        heading: "Limitation of liability",
        paragraphs: [
          `To the maximum extent permitted by law, ${ENTITY_NAME}'s total liability for any claim arising out of or relating to PawOS is limited to the amount you paid us in the twelve months preceding the claim, and neither party is liable for indirect, incidental, special, or consequential damages. Nothing in this section limits liability for fraud, willful misconduct, gross negligence, or any other liability that cannot lawfully be limited or excluded, including statutory consumer-protection rights described in our Privacy Policy and Refund Policy.`,
        ],
      },
      {
        heading: "Indemnification",
        paragraphs: [
          "You agree to indemnify and hold us harmless from claims, damages, and reasonable expenses arising from your violation of these terms or our Acceptable Use Policy, or your misuse of PawOS's Browser Automation, Desktop Automation, or Connector capabilities, except to the extent caused by our own breach of these terms.",
        ],
      },
      TERMINATION_SECTION,
      GOVERNING_LAW_SECTION,
      SEVERABILITY_SECTION,
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    category: "Core",
    summary: "How pawos.revantaai.com uses cookies and similar technologies, and how to control them.",
    lastUpdated: LAST_UPDATED,
    related: ["privacy-policy", "terms"],
    sections: [
      {
        heading: "Scope",
        paragraphs: [
          "This policy covers cookies and similar technologies used by the pawos.revantaai.com website. The PawOS desktop application does not use browser cookies.",
        ],
      },
      {
        heading: "Strictly necessary cookies",
        paragraphs: [
          "Used to operate authentication (keeping you signed in) and checkout (completing a purchase through our payment processor, Razorpay). These are always active because the website cannot function without them, and do not require consent under applicable law.",
        ],
      },
      {
        heading: "Optional analytics cookies",
        paragraphs: [
          "Used, only with your consent given through the cookie banner shown on your first visit, to understand aggregated website usage (pages visited, general navigation patterns) so we can improve the site. We do not use analytics cookies to build advertising profiles or sell data to advertisers.",
        ],
      },
      {
        heading: "Third-party cookies",
        paragraphs: [
          "Our payment processor, Razorpay, may set its own cookies during checkout to secure the payment flow, subject to its own privacy and cookie practices.",
        ],
      },
      {
        heading: "Your choices",
        paragraphs: [
          "You can decline non-essential cookies via the consent banner, and change your choice at any time by clearing site cookies in your browser settings or revisiting the banner. Declining analytics cookies does not affect your ability to use pawos.revantaai.com or PawOS itself.",
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
    summary: "How refunds work for Self-Service Subscriptions and the Autonomous Ticket System's Ticket Balance.",
    lastUpdated: LAST_UPDATED,
    related: ["terms", "enterprise-terms"],
    sections: [
      REFUND_CORE_SECTION,
      {
        heading: "Subscription cancellations",
        paragraphs: [
          "Cancel a Pro, Pro Max, Team, or Enterprise Self-Service Subscription any time from Settings → Billing. You keep access through the end of the period you already paid for; billing simply stops afterward. Downgrading to Paw Go at any point does not generate a partial refund for the current period.",
        ],
      },
      {
        heading: "Autonomous Ticket System billing corrections",
        paragraphs: [
          "Because a Ticket Balance is only ever deducted on genuine completion, billing disputes are expected to be rare. If a run is billed despite failing, being cancelled, hitting its retry limit, or being denied approval, contact billing support with the run's ID; once verified, we credit the Ticket Balance or refund the charge.",
        ],
      },
      {
        heading: "Chargebacks and payment disputes",
        paragraphs: [
          "Please contact billing support before filing a chargeback with your card issuer or bank — most billing issues can be resolved faster that way. Repeated unwarranted chargebacks may result in suspension of your account pending resolution.",
        ],
      },
      {
        heading: "Your statutory rights",
        paragraphs: [
          "Nothing in this policy limits any mandatory refund, cooling-off, or consumer-guarantee right you hold under the law of your country of residence — including India's Consumer Protection Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020; the EU Consumer Rights Directive (subject to its recognized exception for digital content whose supply you've expressly consented to begin before any withdrawal period ends); and the consumer guarantees under the Australian Consumer Law. Where such a right applies, it controls over any conflicting provision above.",
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
    summary: "What you agree not to do with PawOS's AI, Browser Automation, Desktop Automation, and Connector capabilities.",
    lastUpdated: LAST_UPDATED,
    related: ["terms", "safety-guidelines", "security-policy"],
    sections: [
      ACCEPTABLE_USE_CORE_SECTION,
      {
        heading: "Prohibited uses",
        paragraphs: [
          "You agree not to use PawOS to: develop, host, or operate malware or other malicious code; conduct unauthorized intrusion, scanning, or denial-of-service testing against systems you don't own or don't have explicit written permission to test; infringe another person's intellectual property, privacy, or publicity rights; send spam or unsolicited bulk communications through a connected email account; scrape or extract data from a website in violation of that website's own terms of service via Browser Automation; impersonate another person or organization; resell or sublicense access to PawOS without our written permission; or circumvent, disable, or attempt to trick PawOS's Confirmation Gates, Organization approval policies, or billing/credit logic.",
        ],
      },
      {
        heading: "Connector and credential responsibility",
        paragraphs: [
          "You are solely responsible for the Connectors you authorize and the OAuth grants or API tokens behind them. Revoke access for any Connector you no longer use from your connected account's own settings, in addition to disconnecting it inside PawOS.",
        ],
      },
      {
        heading: "Enforcement",
        paragraphs: [
          `Violating this policy may result in suspension or termination of your access, consistent with our Terms of Service. Where required by law or a valid legal process, we may report violations to the relevant authorities.`,
        ],
      },
      {
        heading: "Reporting a violation",
        paragraphs: ["If you believe someone is misusing PawOS in violation of this policy, contact legal@revantaai.com with details."],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "safety-guidelines",
    title: "Safety Guidelines",
    category: "Safety",
    summary: "Practical guidance for using PawOS's Companion Runtime, Browser Automation, and Desktop Automation responsibly.",
    lastUpdated: LAST_UPDATED,
    related: ["acceptable-use-policy", "responsible-ai-usage", "terms"],
    sections: [
      {
        heading: "Review before confirming",
        paragraphs: [
          "PawOS shows a plan and asks for your confirmation before a destructive or production-impacting action runs. Read what's actually being proposed before confirming — the Confirmation Gate only protects you if you use it.",
        ],
      },
      {
        heading: "Scope your Organization's approval policies",
        paragraphs: [
          "In a Team or Enterprise Organization Workspace, configure approval policies for genuinely high-risk action types (production deploys, credential access, member/role changes) rather than everything, so approvals stay meaningful rather than routine rubber-stamping.",
        ],
      },
      {
        heading: "Point automation only at what you're authorized to touch",
        paragraphs: [
          "Browser Automation and Desktop Automation can act on real accounts, files, and systems. Only direct them at accounts, devices, and systems you own or are explicitly authorized to use — the same standard that applies to any automated tooling.",
        ],
      },
      {
        heading: "The Companion Runtime is not a substitute for adult supervision",
        paragraphs: [
          "The Companion Runtime (the 3D companion, including its voice and conversational features) is a software feature, not a substitute for parental or adult supervision. It is not designed or intended for unsupervised use by children.",
        ],
      },
      {
        heading: "Get consent before recording",
        paragraphs: [
          "Communication capture (meeting/call recording) requires your explicit consent inside PawOS and, where applicable, the consent of other participants under your jurisdiction's recording-consent laws. You are responsible for obtaining consent from other participants where required.",
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
    summary: "Our commitments and your responsibilities around AI-generated plans, code, and actions.",
    lastUpdated: LAST_UPDATED,
    related: ["terms", "safety-guidelines", "privacy-policy"],
    sections: [
      {
        heading: "Our commitments",
        paragraphs: [
          "PawOS is designed to report honestly on task outcomes, never fabricate completion of unfinished work, and gate destructive or production-impacting actions behind an explicit Confirmation Gate. The Autonomous Ticket System is billed only on genuine completion, so there is no incentive built into our billing model to overstate what was actually done.",
        ],
      },
      {
        heading: "Limitations of AI-generated output",
        paragraphs: [
          "AI-generated plans, code, text, and other output can be inaccurate, incomplete, or based on a misunderstanding of your request. This is a limitation of the underlying AI technology, not a guarantee of any particular outcome.",
        ],
      },
      {
        heading: "Your responsibilities",
        paragraphs: [
          "You remain responsible for reviewing AI-proposed plans and actions before confirming them, for the accuracy of decisions made based on AI-generated content, and for compliance with any professional, legal, or organizational obligation that applies to your use of AI-assisted work — for example, your own code-review requirements before merging a pull request the Autonomous Ticket System opened.",
        ],
      },
      {
        heading: "Human oversight for consequential decisions",
        paragraphs: [
          "Do not rely on PawOS's AI output as the sole basis for a decision with significant legal, financial, medical, or safety consequences without independent human review.",
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
    summary: "Our approach to securing PawOS, your account, and your data.",
    lastUpdated: LAST_UPDATED,
    related: ["vulnerability-disclosure-policy", "privacy-policy", "data-processing-agreement"],
    sections: [
      {
        heading: "Overview",
        paragraphs: [
          "See our Security documentation page for a technical overview of encryption, authentication, runtime isolation, and credential storage. This policy covers our security commitments and process.",
        ],
      },
      {
        heading: "Authentication and account security",
        paragraphs: [
          "Accounts are authenticated through Supabase Auth, supporting email/password and Google sign-in. We encourage a strong, unique password and recommend enabling any additional account-security options your Google account itself offers when you sign in with Google.",
        ],
      },
      {
        heading: "Credential and connector storage",
        paragraphs: [
          "Organization-shared infrastructure credentials are stored in an encrypted vault, never in plain text. Individual-use Connectors rely on your own already-authenticated CLI/API session or an OAuth grant scoped to the permissions you approve, rather than PawOS independently storing broad standing access to your cloud accounts.",
        ],
      },
      {
        heading: "Data isolation",
        paragraphs: [
          "Organization Workspace data is scoped with row-level security so that one Organization's data is never visible to another, enforced at the database layer rather than solely in application logic.",
        ],
      },
      {
        heading: "Reporting a vulnerability",
        paragraphs: ["See our Vulnerability Disclosure Policy for how to responsibly report a security issue to security@revantaai.com."],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "vulnerability-disclosure-policy",
    title: "Vulnerability Disclosure Policy",
    category: "Security",
    summary: "How to responsibly report a security vulnerability in PawOS.",
    lastUpdated: LAST_UPDATED,
    related: ["security-policy"],
    sections: [
      {
        heading: "Scope",
        paragraphs: [
          "This policy covers the PawOS desktop application, the pawos.revantaai.com website, and the backend services described in our Security Policy.",
        ],
      },
      {
        heading: "How to report",
        paragraphs: [
          "Email security@revantaai.com with steps to reproduce the issue, its potential impact, and any proof-of-concept material. Please avoid public disclosure until we've had a reasonable opportunity to address the issue.",
        ],
      },
      {
        heading: "Our commitment",
        paragraphs: [
          "We aim to acknowledge reports as promptly as we reasonably can and to keep you informed of remediation progress. We do not currently operate a paid bug-bounty program.",
        ],
      },
      {
        heading: "Safe harbor",
        paragraphs: [
          "Good-faith security research conducted consistent with this policy will not result in legal action from us, provided it avoids privacy violations, data destruction, service disruption, and access to data beyond what is necessary to demonstrate the vulnerability.",
        ],
      },
      {
        heading: "Out of scope",
        paragraphs: [
          "Social engineering against our staff, physical attacks against our facilities or personnel, and denial-of-service testing are out of scope for this policy and should not be attempted.",
        ],
      },
      CONTACT_SECTION,
    ],
  },
  {
    slug: "data-processing-agreement",
    title: "Data Processing Agreement",
    category: "Compliance",
    summary: "Terms governing our processing of personal data on behalf of Team and Enterprise Organization customers.",
    lastUpdated: LAST_UPDATED,
    related: ["privacy-policy", "security-policy", "enterprise-terms"],
    sections: [
      {
        heading: "Scope and incorporation",
        paragraphs: [
          "This Data Processing Agreement applies to personal data processed within an Organization Workspace and forms part of the agreement between an Organization and us alongside our Terms of Service and Enterprise Terms.",
        ],
      },
      {
        heading: "Roles",
        paragraphs: [
          `For Organization Workspace data, ${ENTITY_NAME} acts as a data processor (the equivalent term under India's Digital Personal Data Protection Act, 2023 and the GDPR alike) on behalf of the Organization, which acts as data controller — or "Data Fiduciary" under the DPDP Act's terminology — for its members' personal data, subject in each case to applicable data protection law.`,
        ],
      },
      DATA_HANDLING_SECTION,
      SUBPROCESSORS_SECTION,
      {
        heading: "Security measures",
        paragraphs: [
          "Row-level security scoping every record to its Organization, encrypted credential storage for shared infrastructure credentials, and audit logging of security-relevant actions, as described in our Security Policy, apply to Organization Workspace data processed under this agreement.",
        ],
      },
      {
        heading: "International transfers",
        paragraphs: [
          "Organization Workspace data may include personal data of an EU/EEA data subject and be transferred outside the EU/EEA to us or our sub-processors. As described in our Privacy Policy, we have not executed Standard Contractual Clauses or another formal Article 46 GDPR transfer mechanism with every sub-processor as of this writing.",
        ],
      },
      {
        heading: "Assisting with data subject requests",
        paragraphs: [
          "Where a data subject directs a rights request to us regarding data held in an Organization Workspace, we will refer it to the relevant Organization as controller and provide reasonable assistance to help the Organization respond, consistent with our own obligations under this agreement.",
        ],
      },
      {
        heading: "Term and deletion",
        paragraphs: [
          "We process Organization Workspace data for as long as the Organization's subscription is active. On termination, we delete or return Organization Workspace data within a reasonable period at the Organization's request, except where retention is required by law.",
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
    summary: "Additional terms for Enterprise customers covering seats, billing, administration, and support.",
    lastUpdated: LAST_UPDATED,
    related: ["terms", "data-processing-agreement", "refund-policy"],
    sections: [
      {
        heading: "Relationship to standard Terms",
        paragraphs: [
          "These Enterprise Terms supplement our standard Terms of Service for customers on an Enterprise plan, and take precedence over the standard Terms of Service in the event of a direct conflict.",
        ],
      },
      {
        heading: "Seats and billing",
        paragraphs: [
          "Enterprise plans require a minimum of 20 Seats, billed at the uniform base rate shown on our Pricing page, plus Autonomous Ticket System usage billed separately at pass-through provider rates rather than the standard tiered Ticket Balance pricing. Custom volume terms may be agreed in a separate order form, which controls over this document for the specific terms it covers.",
        ],
      },
      {
        heading: "Organization administration",
        paragraphs: [
          "Enterprise Organizations support additional administrative roles beyond Team (IT Administrator, Security Administrator, Department Manager, in addition to Owner, Billing Administrator, Workspace Administrator, and Member). Membership is scoped to your organization's verified email domain; your Organization's administrators are responsible for managing roles, approval policies, and the Credential Vault within the Organization.",
        ],
      },
      {
        heading: "Data processing",
        paragraphs: ["Our Data Processing Agreement governs our processing of personal data within your Organization Workspace and is incorporated into these Enterprise Terms by reference."],
      },
      {
        heading: "Support",
        paragraphs: [
          "Enterprise customers can reach a dedicated support contact at enterprise@revantaai.com and receive priority handling of support requests. Specific response-time service-level commitments, where agreed, are set out in a separate order form or agreement with your Organization rather than as a universal term here.",
        ],
      },
      {
        heading: "Order of precedence",
        paragraphs: ["In case of conflict between documents, a signed order form controls over these Enterprise Terms, which control over our standard Terms of Service."],
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
    lastUpdated: LAST_UPDATED,
    related: ["third-party-licenses", "open-source-notices", "terms"],
    sections: [
      {
        heading: "Application license",
        paragraphs: [
          `${ENTITY_NAME} grants you a limited, non-exclusive, non-transferable, revocable license to install and use PawOS for its intended purpose, subject to these terms and your subscription tier's entitlements. This license does not grant you ownership of PawOS, its source code, or its underlying technology.`,
        ],
      },
      {
        heading: "Restrictions",
        paragraphs: [
          "You may not reverse-engineer, decompile, or disassemble PawOS except to the extent applicable law expressly permits despite this restriction; resell, sublicense, or provide PawOS as a hosted service to third parties without our written permission; or remove or obscure any proprietary notice in PawOS.",
        ],
      },
      {
        heading: "Open source components",
        paragraphs: [
          "PawOS incorporates open source software under their respective licenses. See our Third-Party Licenses and Open Source Notices documents for the complete attribution list.",
        ],
      },
      {
        heading: "Feedback",
        paragraphs: [
          "If you send us feedback or suggestions about PawOS, you agree we may use them without restriction or obligation to you.",
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
    summary: "Licenses for third-party open source software incorporated into PawOS.",
    lastUpdated: LAST_UPDATED,
    related: ["licensing", "open-source-notices"],
    sections: [
      {
        heading: "Overview",
        paragraphs: [
          "PawOS is built with Electron, React, three.js, and numerous other open source packages, each used under its own license — predominantly MIT, Apache 2.0, and BSD-style licenses.",
        ],
      },
      {
        heading: "Full attribution",
        paragraphs: [
          "A complete list of every open source dependency PawOS uses and its corresponding license is available on request at legal@revantaai.com.",
        ],
      },
      CONTACT_SECTION,
    ],
  },
  {
    slug: "open-source-notices",
    title: "Open Source Notices",
    category: "Intellectual Property",
    summary: "Required notices for open source components incorporated into PawOS.",
    lastUpdated: LAST_UPDATED,
    related: ["third-party-licenses", "licensing"],
    sections: [
      {
        heading: "Notices",
        paragraphs: [
          "Where an open source license requires a specific notice to be reproduced (for example, an MIT copyright notice or an Apache 2.0 NOTICE file), that notice is preserved in the corresponding package's own license file and is available, alongside the full dependency list, on request at legal@revantaai.com.",
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
    lastUpdated: LAST_UPDATED,
    related: ["brand-guidelines", "copyright-notice"],
    sections: [
      {
        heading: "Our marks",
        paragraphs: [
          `"PawOS" and its associated logos are trademarks of ${ENTITY_NAME}. You may refer to PawOS by name to describe genuine compatibility, integration, or commentary, but may not use our marks in a way that implies endorsement, sponsorship, or affiliation without our permission.`,
        ],
      },
      {
        heading: "Prohibited use",
        paragraphs: [
          "Do not use our marks as part of your own product, company, or domain name, or in a way likely to confuse users about the source of a product or service.",
        ],
      },
      {
        heading: "Requesting permission",
        paragraphs: ["For any use beyond fair, descriptive reference, contact legal@revantaai.com before use."],
      },
      CONTACT_SECTION,
      CHANGES_SECTION,
    ],
  },
  {
    slug: "brand-guidelines",
    title: "Brand Guidelines",
    category: "Intellectual Property",
    summary: "How to represent the PawOS brand correctly in writing and visually.",
    lastUpdated: LAST_UPDATED,
    related: ["trademark-policy"],
    sections: [
      {
        heading: "Naming",
        paragraphs: ['Write "PawOS" as one word with a capital P and capital OS — not "Paw OS," "pawOS," or "Pawos." Write "Revanta AI" as two words.'],
      },
      {
        heading: "Logo usage",
        paragraphs: [
          "Do not distort, recolor, rotate, or add effects to the PawOS logo. Maintain clear space around it equivalent to at least the height of the logomark. Use the logo only in the color variants we provide.",
        ],
      },
      {
        heading: "Requesting brand assets",
        paragraphs: ["For logo files or other brand assets beyond what's published on this website, contact legal@revantaai.com."],
      },
      CONTACT_SECTION,
    ],
  },
  {
    slug: "copyright-notice",
    title: "Copyright Notice",
    category: "Intellectual Property",
    summary: "Copyright ownership of PawOS's software, documentation, and website content.",
    lastUpdated: LAST_UPDATED,
    related: ["trademark-policy", "licensing"],
    sections: [
      {
        heading: "Notice",
        paragraphs: [
          `© ${new Date().getFullYear()} ${ENTITY_NAME}. All rights reserved. PawOS's software, documentation, and this website's original content may not be reproduced, distributed, publicly displayed, or used to train a machine learning model without our prior written permission, except as permitted by the open source licenses of individually licensed components described in our Third-Party Licenses document.`,
        ],
      },
      {
        heading: "Permitted personal use",
        paragraphs: [
          "You may view and print pages from pawos.revantaai.com for your own personal, non-commercial reference.",
        ],
      },
      {
        heading: "Reporting infringement",
        paragraphs: [
          "If you believe your copyrighted work has been used on pawos.revantaai.com or in PawOS without authorization, contact legal@revantaai.com with enough detail to identify the material and your rights in it, and we will investigate and respond.",
        ],
      },
      CONTACT_SECTION,
    ],
  },
  {
    slug: "compliance-information",
    title: "Compliance Information",
    category: "Compliance",
    summary: "Our current compliance posture and the data-protection frameworks PawOS operates under.",
    lastUpdated: LAST_UPDATED,
    related: ["security-policy", "privacy-policy", "data-processing-agreement"],
    sections: [
      {
        heading: "Current certification status",
        paragraphs: [
          "PawOS does not currently hold formal security or compliance certifications such as SOC 2 or ISO 27001. We state that plainly rather than imply a certification that doesn't exist. Our actual security practices — encrypted credential storage, row-level data isolation, audit logging, and Confirmation Gates — are documented in full in our Security Policy regardless of certification status.",
        ],
      },
      {
        heading: "Data protection frameworks",
        paragraphs: [
          "Depending on where you're located, one or more of the following frameworks may apply to how we handle your personal data: India's Digital Personal Data Protection Act, 2023; the GDPR for users in the EU/EEA (including Finland); the Privacy Act 1988 for users in Australia; and state-level privacy laws in the United States. Our Privacy Policy describes, region by region, what we actually do today and where our current practice has gaps — including that we have not appointed an EU representative under Article 27 GDPR and have not executed Standard Contractual Clauses with every sub-processor. This page does not claim compliance beyond what's described there.",
        ],
      },
      {
        heading: "Payment processing",
        paragraphs: [
          "Payments are processed by Razorpay, which advertises PCI-DSS compliance for its own systems. We do not store your full card or bank account details ourselves.",
        ],
      },
      {
        heading: "Roadmap",
        paragraphs: [
          "We do not hold a formal security certification today and have no committed date for one. If that changes, we will update this page with real, verifiable status rather than a projected timeline.",
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
