import { describe, expect, it } from 'vitest';
import { classifyCodingRequest, isExecutionClassification } from './RequestClassification';

describe('classifyCodingRequest', () => {
  it('classifies explanation and diagnosis as ANALYZE', () => {
    expect(classifyCodingRequest('Explain this TypeScript error.')).toBe('ANALYZE');
    expect(classifyCodingRequest('Diagnose why the build is failing without changing files.')).toBe('ANALYZE');
  });

  it('classifies structure and architecture questions as PLAN_ONLY', () => {
    expect(classifyCodingRequest('How should I structure this project?')).toBe('PLAN_ONLY');
    expect(classifyCodingRequest('Design the architecture before we implement anything.')).toBe('PLAN_ONLY');
  });

  it('classifies command-only help as GUIDANCE', () => {
    expect(classifyCodingRequest('Give me the command to fix this.')).toBe('GUIDANCE');
    expect(classifyCodingRequest('What command should I run to update dependencies?')).toBe('GUIDANCE');
  });

  it('classifies bounded requested mutation as EXECUTE', () => {
    expect(classifyCodingRequest('Fix this error in my project.')).toBe('EXECUTE');
    expect(classifyCodingRequest('Run the test suite for this project.')).toBe('EXECUTE');
    expect(classifyCodingRequest('Build Project from the approved PROJECT PLAN.')).toBe('EXECUTE');
  });

  it('classifies only explicit broad loops as AUTONOMOUS_ENGINEERING', () => {
    expect(classifyCodingRequest('Build this entire application and keep fixing it until tests pass.')).toBe('AUTONOMOUS_ENGINEERING');
    expect(classifyCodingRequest('Fix this error in my project.')).not.toBe('AUTONOMOUS_ENGINEERING');
  });

  it('distinguishes execution classifications from planning, analysis, and guidance', () => {
    expect(isExecutionClassification('EXECUTE')).toBe(true);
    expect(isExecutionClassification('AUTONOMOUS_ENGINEERING')).toBe(true);
    expect(isExecutionClassification('PLAN_ONLY')).toBe(false);
    expect(isExecutionClassification('ANALYZE')).toBe(false);
    expect(isExecutionClassification('GUIDANCE')).toBe(false);
  });
});
