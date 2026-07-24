export type SectionId =
  | 'home'
  | 'talk'
  | 'companionLab'
  | 'projects'
  | 'apps'
  | 'analytics'
  | 'history'
  | 'workHistory'
  | 'browserCapabilities'
  | 'communicationDrafts'
  | 'office'
  | 'infrastructure'
  | 'development'
  | 'desktop'
  | 'settings'
  | 'upgrade';

export const SECTION_TITLES: Record<SectionId, string> = {
  home: 'Home',
  talk: 'Talk with Paw',
  companionLab: 'Companion Studio',
  projects: 'Projects',
  apps: 'Apps',
  analytics: 'Analytics',
  history: 'Conversation History',
  workHistory: 'Work History',
  browserCapabilities: 'Research',
  communicationDrafts: 'Communication',
  office: 'Office',
  infrastructure: 'Cloud',
  development: 'Development',
  desktop: 'Files',
  settings: 'Settings',
  upgrade: 'Upgrade',
};
