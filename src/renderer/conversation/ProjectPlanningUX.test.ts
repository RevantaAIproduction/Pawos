import { describe, expect, it } from 'vitest';
import {
  buildArchitectureDiagram,
  getProjectPlanLifecycle,
  isProjectPlanMessage,
  parseProjectPlanSections,
  summarizePlanCoverage,
} from './ProjectPlanningUX';

const plan = `PROJECT PLAN

Product Scope
Build a SaaS workspace with authentication and subscription features.

User Flows
Users log in, create projects, and review usage.

Architecture
React frontend, backend API, database schema, and external email integration.

Testing
Run typecheck, build, tests, preview, screenshot, and visual QA.

[ Build ] [ Modify Plan ]`;

describe('ProjectPlanningUX', () => {
  it('detects project plans and parses them into structured sections', () => {
    expect(isProjectPlanMessage(plan)).toBe(true);
    expect(parseProjectPlanSections(plan).map((section) => section.title)).toContain('Architecture');
  });

  it('detects localized project plan labels produced by the current spoken-language setting', () => {
    expect(isProjectPlanMessage('### Proje Planı: OrbitDesk\n\n👉 **[ Projeyi İnşa Et ]**\n👉 **[ Planı Değiştir ]**')).toBe(true);
  });

  it('summarizes blueprint coverage for launch-scale requests', () => {
    expect(summarizePlanCoverage(plan).missing).toEqual([]);
  });

  it('derives an architecture diagram from the plan content when meaningful', () => {
    expect(buildArchitectureDiagram(plan)).toMatchObject({
      nodes: expect.arrayContaining(['Frontend', 'Backend API', 'Database', 'Auth and Permissions', 'External Integrations']),
    });
  });

  it('tracks the visible project lifecycle without treating execute as autonomous', () => {
    expect(getProjectPlanLifecycle('BUILDING').filter((step) => step.complete).map((step) => step.label)).toEqual(['DRAFT', 'APPROVED']);
    expect(getProjectPlanLifecycle('INCOMPLETE').find((step) => step.label === 'VERIFYING')?.active).toBe(true);
  });
});
