import { describe, expect, it } from 'vitest';
import { planRequestContext } from './contextPlanner';
import { buildSystemPrompt, buildSystemPromptForCapabilities, corePromptParagraphs, corePromptSectionTag } from './systemPrompt';
import { INTELLIGENCE_PROMPT_MODULES, PROMPT_MODULE_GROUPS } from './systemPromptModules';

const groupsOf = (text: string) => planRequestContext(text)?.groups ?? null;

describe('planRequestContext — capability groups from the user’s own words', () => {
  it('coding on a named file → files + coding + terminal, nothing else', () => {
    expect(groupsOf('fix src/auth/login.ts')).toEqual(['files', 'coding', 'terminal']);
    expect(groupsOf('inspect src/auth/login.ts')).toEqual(['files']);
    expect(groupsOf('explain this function in src/auth/login.ts')).toEqual(['files', 'coding', 'terminal']);
  });

  it('GitHub PR → github + git + terminal', () => {
    expect(groupsOf('create a GitHub PR')).toEqual(expect.arrayContaining(['github', 'git', 'terminal']));
    expect(groupsOf('create a GitHub PR')).not.toContain('browser');
  });

  it('web research → research + browser only', () => {
    expect(groupsOf('search the web for current information')).toEqual(['browser', 'research']);
  });

  it('Jira → tickets (no coding unless asked)', () => {
    expect(groupsOf('create a Jira ticket')).toEqual(['tickets']);
  });

  it('browser task → browser', () => {
    expect(groupsOf('open amazon.com and add the first result to my cart')).toEqual(expect.arrayContaining(['browser']));
  });

  it('terminal task → terminal (+ files for the path)', () => {
    expect(groupsOf('run npm test in C:/projects/site')).toEqual(expect.arrayContaining(['terminal', 'files']));
  });

  it('mixed task → the union', () => {
    const g = groupsOf('research the best React chart library and add it to my project');
    expect(g).toEqual(expect.arrayContaining(['research', 'browser', 'coding', 'files', 'terminal']));
  });

  it('continuations and unplaceable requests keep the full context', () => {
    expect(groupsOf('yes, do that')).toBeNull();
    expect(groupsOf('continue what we were doing')).toBeNull();
    expect(groupsOf('check my calendar')).toBeNull(); // PawOS has no calendar tool — full context, honest answer
    expect(groupsOf('')).toBeNull();
  });
});

describe('system prompt sections', () => {
  it('every CORE_PROMPT paragraph is tagged (core or capability groups)', () => {
    const untagged = corePromptParagraphs().filter((p) => corePromptSectionTag(p) === null).map((p) => p.slice(0, 60));
    expect(untagged).toEqual([]);
  });

  it('every prompt module is tagged with a capability group', () => {
    expect(INTELLIGENCE_PROMPT_MODULES.filter((m) => !PROMPT_MODULE_GROUPS[m.id]?.length).map((m) => m.id)).toEqual([]);
  });

  it('a coding request gets the core safety rules and coding sections — not meetings, browsing, tickets or email', () => {
    const p = buildSystemPromptForCapabilities(true, false, ['files', 'coding', 'terminal']);
    expect(p).toContain('Credential and secret safety');
    expect(p).toContain('Some actions (creating a folder');
    expect(p).toContain('Coding Intelligence:');
    expect(p).toContain('Minimal Change Philosophy');
    expect(p).not.toContain('Communication Intelligence');
    expect(p).not.toContain('Browser Intelligence');
    expect(p).not.toContain('Enterprise Ticket Intelligence');
    expect(p).not.toContain('Email Follow-up');
    expect(p).not.toContain('Resumes / CVs'); // resume rule only with documents
    expect(p.length).toBeLessThan(buildSystemPrompt(true, false).length / 2);
  });

  it('the selected prompt uses the same wording (every selected paragraph appears verbatim in the full prompt)', () => {
    const full = buildSystemPrompt(true, true);
    for (const para of buildSystemPromptForCapabilities(true, true, ['documents', 'research', 'browser']).split(/\n{2,}/)) {
      expect(full).toContain(para);
    }
  });
});
