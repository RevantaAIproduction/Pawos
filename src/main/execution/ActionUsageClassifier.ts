import type { ActionRequest } from '../../shared/actions/ActionTypes';
import { CODING_EXECUTION_ACTION_TYPES, INFRA_EXECUTION_ACTION_TYPES } from '../../shared/actions/ActionTypes';
import type { UsageCapability } from '../../shared/billing/UsageEngineTypes';

export type MeteredUsageCapability = Exclude<UsageCapability, 'aiReasoning'>;

const LONG_RUNNING_ACTION_TYPES = new Set<ActionRequest['type']>(['startProcess', 'devBrowserPreview', 'runValidationPipeline']);
const BROWSER_AUTOMATION_ACTION_TYPES = new Set<ActionRequest['type']>(['devBrowserPreview']);
const AUTONOMOUS_ACTION_TYPES = new Set<ActionRequest['type']>([
  'startAutonomousEngineeringTask',
  'completeAutonomousEngineeringTask',
  'endAutonomousEngineeringTask',
]);
const REPOSITORY_ANALYSIS_ACTION_TYPES = new Set<ActionRequest['type']>([
  'analyzeProject',
  'analyzeProjectStructure',
  'analyzeFileImpact',
  'buildDependencyGraph',
  'discoverProjectFeatures',
  'classifyProjectAssets',
  'detectDomainConcepts',
  'buildRepositorySemanticIndex',
  'discoverAffectedFiles',
  'queryCodingRuntimeMemory',
  'analyzeRepository',
  'investigateRepoBug',
]);
const WEBSITE_ANALYSIS_ACTION_TYPES = new Set<ActionRequest['type']>([
  'analyzeWebsite',
  'crawlWebsite',
  'reviewUx',
  'analyzeMarketing',
  'scoreProduct',
  'askFounderAdvisor',
]);

export function classifyActionUsageCapability(type: ActionRequest['type']): MeteredUsageCapability | null {
  if (AUTONOMOUS_ACTION_TYPES.has(type)) return 'autonomousExecution';
  if (BROWSER_AUTOMATION_ACTION_TYPES.has(type)) return 'browserAutomation';
  if (LONG_RUNNING_ACTION_TYPES.has(type)) return 'longRunningWorkflow';
  if (INFRA_EXECUTION_ACTION_TYPES.includes(type) || type === 'runDeployScript') return 'autonomousExecution';
  if (CODING_EXECUTION_ACTION_TYPES.includes(type)) return 'codeExecution';
  if (REPOSITORY_ANALYSIS_ACTION_TYPES.has(type)) return 'repositoryAnalysis';
  if (WEBSITE_ANALYSIS_ACTION_TYPES.has(type)) return 'websiteAnalysis';
  return null;
}

export function shouldEnforceCustomerUsage(type: ActionRequest['type']): boolean {
  if (AUTONOMOUS_ACTION_TYPES.has(type)) return false;
  return CODING_EXECUTION_ACTION_TYPES.includes(type) || INFRA_EXECUTION_ACTION_TYPES.includes(type) || type === 'runDeployScript';
}
