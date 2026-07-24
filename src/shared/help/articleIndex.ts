import type { HelpArticle } from './HelpArticleTypes';
import { GETTING_STARTED_ARTICLES } from './articles/gettingStarted';
import { COMPANION_ARTICLES } from './articles/companion';
import { PROJECTS_ARTICLES } from './articles/projects';
import { DEVELOPMENT_ARTICLES } from './articles/development';
import { RESEARCH_ARTICLES } from './articles/research';
import { COMMUNICATION_ARTICLES } from './articles/communication';
import { CLOUD_ARTICLES } from './articles/cloud';
import { ANALYTICS_ARTICLES } from './articles/analytics';
import { ACCOUNT_ARTICLES } from './articles/account';
import { SUBSCRIPTION_ARTICLES } from './articles/subscription';
import { BILLING_ARTICLES } from './articles/billing';
import { PRIVACY_ARTICLES } from './articles/privacy';
import { SECURITY_ARTICLES } from './articles/security';
import { DESKTOP_ARTICLES } from './articles/desktop';
import { MOBILE_ARTICLES } from './articles/mobile';

/** The single source of truth for every Help Center article — aggregated across all 15 category files. */
export const ALL_ARTICLES: HelpArticle[] = [
  ...GETTING_STARTED_ARTICLES,
  ...COMPANION_ARTICLES,
  ...PROJECTS_ARTICLES,
  ...DEVELOPMENT_ARTICLES,
  ...RESEARCH_ARTICLES,
  ...COMMUNICATION_ARTICLES,
  ...CLOUD_ARTICLES,
  ...ANALYTICS_ARTICLES,
  ...ACCOUNT_ARTICLES,
  ...SUBSCRIPTION_ARTICLES,
  ...BILLING_ARTICLES,
  ...PRIVACY_ARTICLES,
  ...SECURITY_ARTICLES,
  ...DESKTOP_ARTICLES,
  ...MOBILE_ARTICLES,
];

export function getArticleById(id: string): HelpArticle | undefined {
  return ALL_ARTICLES.find((a) => a.id === id);
}

export const CATEGORY_LABELS: Record<HelpArticle['category'], string> = {
  gettingStarted: 'Getting Started',
  companion: 'Companion',
  projects: 'Projects',
  development: 'Development',
  research: 'Research',
  communication: 'Communication',
  cloud: 'Cloud',
  analytics: 'Analytics',
  account: 'Account',
  subscription: 'Subscription',
  billing: 'Billing',
  privacy: 'Privacy',
  security: 'Security',
  desktop: 'Desktop',
  mobile: 'Mobile',
};
