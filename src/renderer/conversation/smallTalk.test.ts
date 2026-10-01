import { describe, expect, it } from 'vitest';
import { isSmallTalkMessage, localSmallTalkReply } from './smallTalk';

describe('isSmallTalkMessage — a closed list of greetings and thanks', () => {
  it.each(['hii', 'hi', 'Hiiii!', 'hello', 'Hello Paw', 'hey', 'heyyy', 'thanks', 'Thank you!', 'thx', 'good morning', 'Good evening :)', "what's up", 'whats up', 'hi there', 'thanks 🙏'])(
    '"%s" is small talk',
    (text) => expect(isSmallTalkMessage(text)).toBe(true)
  );

  it.each([
    'ok', 'okay', 'yes', 'yes, do that', 'okay, proceed', 'do it', 'go ahead', 'fix it', 'continue',
    'what is 2+2?', 'hi, can you fix the login bug?', 'hello world program in python', 'thanks, now deploy it', '',
  ])('"%s" is NOT small talk', (text) => expect(isSmallTalkMessage(text)).toBe(false));

  it('a greeting or thanks right after Paw asked a question is not handled locally', () => {
    expect(isSmallTalkMessage('thanks', { lastAssistantMessage: 'Should I create the folder?' })).toBe(false);
    expect(isSmallTalkMessage('thanks', { lastAssistantMessage: 'Done — the folder is ready.' })).toBe(true);
  });
});

describe('localSmallTalkReply', () => {
  it('answers each kind naturally', () => {
    expect(localSmallTalkReply('hii')).toMatch(/^Hi!/);
    expect(localSmallTalkReply('Good morning')).toMatch(/^Good morning!/);
    expect(localSmallTalkReply('good night')).toMatch(/^Good night!/);
    expect(localSmallTalkReply('thank you so much')).toMatch(/^You're welcome!/);
    expect(localSmallTalkReply("what's up")).toMatch(/ready when you are/);
  });
});

