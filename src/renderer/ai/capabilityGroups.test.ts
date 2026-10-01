import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildRequestCapabilitiesTool,
  CAPABILITY_GROUPS,
  expandCapabilityGroups,
  REQUEST_CAPABILITIES_TOOL_NAME,
  selectToolsForGroups,
  TOOL_CAPABILITIES,
} from './capabilityGroups';
import type { ReasoningToolDefinition } from '../reasoning/ReasoningTypes';

let ALL_TOOLS: ReasoningToolDefinition[] = [];

beforeAll(async () => {
  const g = globalThis as any;
  g.window ??= g;
  g.addEventListener ??= () => {};
  g.removeEventListener ??= () => {};
  g.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  ALL_TOOLS = (await import('./IntentRegistry')).ACTION_TOOL_DEFINITIONS;
});

describe('capability map', () => {
  it('every tool PawOS offers belongs to at least one capability group', () => {
    const unmapped = ALL_TOOLS.map((t) => t.name).filter((name) => !(TOOL_CAPABILITIES[name]?.length));
    expect(unmapped).toEqual([]);
  });

  it('the map has no stale entries for tools that no longer exist', () => {
    const names = new Set(ALL_TOOLS.map((t) => t.name));
    expect(Object.keys(TOOL_CAPABILITIES).filter((n) => !names.has(n))).toEqual([]);
  });

  it('every capability group has at least one tool', () => {
    const used = new Set(Object.values(TOOL_CAPABILITIES).flat());
    expect(CAPABILITY_GROUPS.filter((g) => !used.has(g))).toEqual([]);
  });

  it('dependencies expand transitively (coding brings files + terminal; autonomous brings the engineering set)', () => {
    expect(expandCapabilityGroups(['coding'])).toEqual(['files', 'coding', 'terminal']);
    expect(expandCapabilityGroups(['research'])).toEqual(['browser', 'research']);
    expect(expandCapabilityGroups(['autonomous'])).toEqual(expect.arrayContaining(['autonomous', 'tickets', 'coding', 'files', 'terminal', 'git', 'github']));
  });

  it('selects only the tools of the chosen groups, plus tools already used in the conversation', () => {
    const coding = selectToolsForGroups(ALL_TOOLS, expandCapabilityGroups(['coding'])).map((t) => t.name);
    expect(coding).toEqual(expect.arrayContaining(['read_file', 'apply_code_edit', 'run_command']));
    expect(coding).not.toContain('browse_web');
    expect(coding).not.toContain('start_communication_capture');
    expect(coding).not.toContain('show_widget');
    const withUsed = selectToolsForGroups(ALL_TOOLS, ['coding'], new Set(['browse_web'])).map((t) => t.name);
    expect(withUsed).toContain('browse_web');
  });

  it('request_capabilities offers only the groups that are not loaded yet', () => {
    const tool = buildRequestCapabilitiesTool(['files', 'coding', 'terminal']);
    expect(tool.name).toBe(REQUEST_CAPABILITIES_TOOL_NAME);
    const offered = (tool.parameters as any).properties.groups.items.enum as string[];
    expect(offered).toContain('browser');
    expect(offered).not.toContain('coding');
  });
});
