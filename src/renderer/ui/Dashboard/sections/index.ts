export type SectionId =
  | 'home'
  | 'companionLab'
  | 'projects'
  | 'apps'
  | 'analytics'
  | 'workHistory'
  | 'browserCapabilities'
  | 'communicationDrafts'
  | 'office'
  | 'infrastructure'
  | 'development'
  | 'desktop'
  | 'career'
  | 'admin'
  | 'settings'
  | 'upgrade';

export const SECTION_TITLES: Record<SectionId, string> = {
  home: 'Home',
  companionLab: 'Companion Studio',
  projects: 'Projects',
  apps: 'Apps',
  analytics: 'Analytics',
  workHistory: 'Working History',
  browserCapabilities: 'Research',
  communicationDrafts: 'Communication',
  office: 'Office',
  infrastructure: 'Cloud',
  development: 'Development',
  desktop: 'Files',
  career: 'Career',
  admin: 'Admin',
  settings: 'Settings',
  upgrade: 'Upgrade',
};
