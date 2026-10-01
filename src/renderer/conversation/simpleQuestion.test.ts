import { describe, expect, it } from 'vitest';
import { classifyMinimalQuestion, MINIMAL_QUESTION_SYSTEM_PROMPT, recentPlainTextHistory } from './simpleQuestion';

const fresh = { hasHistory: false, previousWasMinimalQuestion: false };

describe('classifyMinimalQuestion — simple factual/general questions take the minimal path', () => {
  it.each([
    'What is 2+2?', 'what is 2+2?', 'What is HTTP?', 'Explain recursion.', 'Who invented the telephone?',
    'What does API mean?', 'Convert 10 km to miles.', 'What is an API?', 'What is a linked list?',
    'Can you explain recursion?', 'Why is the sky blue?', 'How does photosynthesis work?', 'Define entropy',
    'What is merge sort?',
  ])('"%s" → standalone minimal', (text) => expect(classifyMinimalQuestion(text, fresh)).toEqual({ kind: 'standalone' }));

  it.each([
    // tasks, tools, workspace, accounts
    'Fix this bug.', 'Open my GitHub PR.', 'Check my calendar.', 'Analyze this file.', 'Deploy this.', 'Create a Jira ticket.',
    'fix src/auth/login.ts', 'What does this error mean?', 'What is in src/auth/login.ts?', 'How do I install Python?',
    'Can you open the settings?', 'What is on my screen?',
    // live / current information
    'Search the web for today\'s price.', 'What is the weather today?', "What's Apple's current stock price?",
    "What is Gemini's current price?", 'What happened today?', 'What is the latest version of Node?',
    // PawOS itself
    'What is Paw Compute?', 'How many credits do I have?',
    // follow-ups / continuations
    'Continue what we were doing.', 'Yes, do that.', 'Why is that different from HTTPS?', 'And what about UDP?',
    // not a question at all
    'hello', 'Build me a landing page', '',
  ])('"%s" → full path', (text) => expect(classifyMinimalQuestion(text, fresh)).toBeNull());

  it('a follow-up to a previous plain Q&A keeps the minimal path with context', () => {
    const afterQa = { hasHistory: true, previousWasMinimalQuestion: true };
    expect(classifyMinimalQuestion('Why is HTTP different from HTTPS?', afterQa)).toEqual({ kind: 'followUp' });
    expect(classifyMinimalQuestion('Why is that different from HTTPS?', afterQa)).toEqual({ kind: 'followUp' });
    expect(classifyMinimalQuestion('What is DNS?', afterQa)).toEqual({ kind: 'standalone' });
  });

  it('a reference back after a tool/task turn goes to the full path', () => {
    const afterTask = { hasHistory: true, previousWasMinimalQuestion: false };
    expect(classifyMinimalQuestion('Why is that different from HTTPS?', afterTask)).toBeNull();
    expect(classifyMinimalQuestion('Why did it fail?', afterTask)).toBeNull();
    expect(classifyMinimalQuestion('What is DNS?', afterTask)).toEqual({ kind: 'standalone' });
  });

  it('the minimal instruction is one short line', () => {
    expect(MINIMAL_QUESTION_SYSTEM_PROMPT).toBe("You are PawOS. Answer the user's question accurately and concisely.");
  });
});

describe('recentPlainTextHistory', () => {
  it('keeps only recent plain text, starting on a user message, shortened', () => {
    const h = [
      { role: 'assistant', content: 'old' },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b', toolCalls: [{}] },
      { role: 'tool', content: 'big result' },
      { role: 'assistant', content: 'x'.repeat(1500) },
    ];
    const out = recentPlainTextHistory(h);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(out[1]!.content.length).toBe(1201);
  });
});
