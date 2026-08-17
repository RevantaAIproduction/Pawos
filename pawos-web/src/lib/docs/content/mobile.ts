import type { DocPage } from '../types';

export const mobilePages: DocPage[] = [
  {
    section: 'mobile',
    slug: 'overview',
    title: 'Mobile Overview',
    description: 'PawOS on a paired phone — a companion surface, not a second full app.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS Mobile is a paired-phone PWA (progressive web app) that extends your desktop session to a phone — it is not an independent, full-featured mobile application.',
      },
      {
        type: 'paragraph',
        text: 'Pairing uses a QR code scanned from the desktop app to establish a trusted device relationship, secured with real encryption and token rotation.',
      },
    ],
    related: ['mobile/connectivity', 'mobile/supported-capabilities'],
  },
  {
    section: 'mobile',
    slug: 'connectivity',
    title: 'Mobile Connectivity',
    description: 'How the phone and desktop stay in sync.',
    blocks: [
      {
        type: 'paragraph',
        text: 'A Cross Device Runtime is the central sync hub — it keeps conversation state, notifications, and pending approvals consistent between your desktop session and a paired phone in real time.',
      },
    ],
    related: ['mobile/presence', 'mobile/overview'],
  },
  {
    section: 'mobile',
    slug: 'presence',
    title: 'Mobile Presence',
    description: 'What actually syncs to your phone.',
    blocks: [
      {
        type: 'list',
        items: [
          'Conversation sync — see what PawOS is doing/has done from your phone.',
          'Notifications for events that happened on desktop.',
          'An Approval Center — confirm a pending destructive action from your phone when you’re away from your desktop.',
        ],
      },
    ],
    related: ['mobile/supported-capabilities', 'security/permissions'],
  },
  {
    section: 'mobile',
    slug: 'supported-capabilities',
    title: 'Supported Capabilities',
    description: 'What you can actually do from the phone PWA today.',
    blocks: [
      {
        type: 'list',
        items: [
          'Read conversation history and current task status.',
          'Receive real notifications for desktop events.',
          'Approve or deny a pending confirmation remotely.',
          'Pair/unpair a device and manage active sessions.',
        ],
      },
    ],
    related: ['mobile/limitations'],
  },
  {
    section: 'mobile',
    slug: 'limitations',
    title: 'Limitations',
    description: 'What Mobile Presence does not do.',
    blocks: [
      {
        type: 'status',
        status: 'not-implemented',
        text: 'The phone PWA is not an independent execution surface — it does not run the Coding Runtime, connect to connectors on its own, or take actions your desktop session isn’t already driving. It extends and remotely controls a desktop session; it does not replace one.',
      },
    ],
    related: ['mobile/supported-capabilities', 'mobile/overview'],
  },
];
