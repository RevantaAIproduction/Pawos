export type SectionId = 'home' | 'talk' | 'companionLab' | 'history' | 'workHistory' | 'browserCapabilities' | 'communicationDrafts' | 'desktop' | 'settings';

export const SECTION_TITLES: Record<SectionId, string> = {
  home: 'Home',
  talk: 'Talk with Paw',
  companionLab: 'Companion Studio',
  history: 'Conversation History',
  workHistory: 'Work History',
  browserCapabilities: 'Browser Capabilities',
  communicationDrafts: 'Meeting Summaries',
  desktop: 'Desktop',
  settings: 'Settings',
};
