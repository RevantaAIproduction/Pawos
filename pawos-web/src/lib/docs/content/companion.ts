import type { DocPage } from '../types';

export const companionPages: DocPage[] = [
  {
    section: 'companion',
    slug: 'overview',
    title: 'Companion',
    description: 'The real-time 3D character rendered on your desktop.',
    blocks: [
      {
        type: 'lead',
        text: 'The companion is a live, real-time 3D character (rendered with three.js) that reflects PawOS’s emotional state and speaks with lip-synced viseme animation while it talks.',
      },
      {
        type: 'paragraph',
        text: 'It is the authoritative interface — a legacy 2D companion stack exists in the codebase but is not the active one.',
      },
    ],
    related: ['companion/custom-companion', 'companion/desktop-companion'],
  },
  {
    section: 'companion',
    slug: 'custom-companion',
    title: 'Custom Companion',
    description: 'Personality presets, voice, and uploading your own model.',
    blocks: [
      {
        type: 'list',
        items: [
          'Personality presets — friendly, professional, creative, teacher, assistant — change tone and behavior, not the underlying capabilities.',
          'Voice speed and emotional expressiveness are configurable per companion.',
          'You can upload an existing 3D model to use as your companion — see 3D Model Requirements.',
        ],
      },
      {
        type: 'status',
        status: 'not-implemented',
        text: 'AI-generated avatars (e.g. from a photo) are not implemented — the avatar-generation provider interface exists as a reserved extension point, but no provider is wired up. Uploading your own model is the real, working path today.',
      },
    ],
    related: ['companion/3d-model-requirements'],
  },
  {
    section: 'companion',
    slug: '3d-model-requirements',
    title: '3D Model Requirements',
    description: 'Supported formats for uploading your own companion.',
    blocks: [
      {
        type: 'list',
        items: ['glTF / .glb', '.vrm', '.fbx', '.obj'],
      },
      {
        type: 'note',
        text: 'A real thumbnail is generated automatically from the uploaded model for use in the companion gallery.',
      },
    ],
    related: ['companion/custom-companion'],
  },
  {
    section: 'companion',
    slug: 'wake-word',
    title: 'Wake Word',
    description: 'Push-to-talk is the real, primary input method.',
    blocks: [
      {
        type: 'status',
        status: 'not-verified',
        text: 'This documentation could not confirm always-listening wake-word activation as a currently shipped, verified capability. Push-to-talk (a keyboard shortcut, configurable in Settings) is the confirmed, primary voice-input method — use that unless you have separately verified wake-word support in your build.',
      },
    ],
    related: ['companion/overview', 'getting-started/quickstart'],
  },
  {
    section: 'companion',
    slug: 'desktop-companion',
    title: 'Desktop Companion',
    description: 'How the companion behaves as a persistent desktop presence.',
    blocks: [
      {
        type: 'lead',
        text: 'The companion sits on your desktop as a click-through, always-available presence — idle animation while unused, reacting to real notifications, and expanding into a workspace canvas when a task is running.',
      },
    ],
    related: ['companion/overview', 'concepts/workspaces'],
  },
  {
    section: 'companion',
    slug: 'permissions',
    title: 'Companion Permissions',
    description: 'What the companion needs access to, and what it doesn’t.',
    blocks: [
      {
        type: 'list',
        items: [
          'Microphone access — only if you use voice input; text input works without it.',
          'The companion overlay itself does not require elevated OS permissions beyond normal window display.',
          'Companion memory (goals, routines) is stored locally; resetting it is an irreversible, always-confirmed action — the same confirmation discipline as any other destructive action.',
        ],
      },
    ],
    related: ['security/permissions', 'companion/overview'],
  },
];
