const WINDOWS_PATH_RE = /[A-Za-z]:\\[^\s"'`<>|]+/g;
const POSIX_PATH_RE = /(?:^|\s)(\/(?:[\w.-]+\/)+[\w.-]+)/g;
const COMMAND_LINE_RE = /(?:^|\n)\s*(?:Command:\s*)?(?:npm|pnpm|yarn|node|npx|git|tsc|vite|webpack|electron|powershell|cmd)\s+[^\n]+/gi;
const STACK_TRACE_RE = /\b(?:at\s+[\w.$<>]+\s+\(|Error:\s|TypeError:|ReferenceError:|SyntaxError:).{20,}/g;
const DIFF_RE = /(?:^|\n)[+-]{1,3}(?!\+|\-).*/g;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Code block is shown on screen. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export function createSpeechPresentation(text: string): string {
  const original = text.trim();
  if (!original) return '';

  const fileMentions = [...original.matchAll(WINDOWS_PATH_RE)].map((m) => m[0]).concat(
    [...original.matchAll(POSIX_PATH_RE)].map((m) => m[1] ?? '').filter(Boolean)
  );
  const commandMentions = original.match(COMMAND_LINE_RE) ?? [];
  const hasStackTrace = STACK_TRACE_RE.test(original);
  const diffLines = original.match(DIFF_RE) ?? [];
  const buildPassed = /build (?:completed|passed|succeeded)|compiled successfully|verification passed/i.test(original);
  const buildFailed = /build failed|compiled with errors|tests? failed|error timeline|exit code [1-9]/i.test(original);

  if (commandMentions.length > 0 && buildPassed) return 'The production build passed. Full output is available on screen.';
  if (commandMentions.length > 0 && buildFailed) return 'The command failed. I have shown the exact output and next details on screen.';
  if (commandMentions.length > 0) return `I ran ${plural(commandMentions.length, 'command')}. The full command text and output are on screen.`;
  if (diffLines.length > 4) return 'I updated the project. You can review the full diff on screen.';
  if (fileMentions.length >= 3) return `I referenced ${plural(fileMentions.length, 'file or folder')}. The exact paths are on screen.`;
  if (fileMentions.length > 0) {
    const names = fileMentions
      .map((path) => path.split(/[\\/]/).filter(Boolean).pop())
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    return names ? `I referenced ${names}. The full path is on screen.` : 'I referenced a project path. The full path is on screen.';
  }
  if (hasStackTrace || original.length > 700) return 'I have the details ready on screen. Here is the short version: ' + stripMarkdown(original).slice(0, 260).trim();

  return stripMarkdown(original).replace(/\s+/g, ' ').trim();
}

export function isExplicitSpeechRequest(text: string): boolean {
  return /\b(speak this|speak that|read this|read that|say it|talk to me|use voice|tell me verbally)\b/i.test(text.trim());
}

export function isVoiceOutputOnRequest(text: string): boolean {
  return /\b(?:turn|switch|set|enable)\s+(?:voice output|speech output|tts)\s+(?:on|up|enabled)|\buse voice output\b/i.test(text.trim());
}

export function isVoiceOutputOffRequest(text: string): boolean {
  return /\b(?:turn|switch|set|disable)\s+(?:voice output|speech output|tts)\s+(?:off|down|disabled)|\bstop speaking automatically\b/i.test(text.trim());
}
