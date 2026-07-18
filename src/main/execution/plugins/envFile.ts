const KEY_LINE = /^\s*([\w.\-]+)\s*=/;

/** Just the key names, in file order — never values, since .env files commonly hold secrets that shouldn't reach the model. */
export function parseEnvKeys(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.match(KEY_LINE)?.[1])
    .filter((key): key is string => Boolean(key));
}

/** Upserts one KEY=value line, preserving every other line (comments, blank lines, other vars) exactly as-is. */
export function upsertEnvVar(content: string, key: string, value: string): string {
  const lines = content.length > 0 ? content.split('\n') : [];
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineIndex = lines.findIndex((line) => new RegExp(`^\\s*${escapedKey}\\s*=`).test(line));

  const newLine = `${key}=${value}`;
  if (lineIndex >= 0) {
    lines[lineIndex] = newLine;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(newLine);
  }
  return lines.join('\n');
}
