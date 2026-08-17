'use client';

import { useState } from 'react';

const KEYWORDS: Record<string, string[]> = {
  ts: ['const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'interface', 'type', 'async', 'await', 'if', 'else', 'new'],
  tsx: ['const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'interface', 'type', 'async', 'await', 'if', 'else', 'new'],
  js: ['const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'async', 'await', 'if', 'else', 'new'],
  python: ['def', 'return', 'import', 'from', 'class', 'if', 'else', 'elif', 'for', 'while', 'as', 'with', 'try', 'except'],
  bash: [],
  powershell: [],
  json: [],
  text: [],
};

const LANG_LABEL: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  bash: 'Bash',
  powershell: 'PowerShell',
  json: 'JSON',
  python: 'Python',
  text: 'Text',
};

/**
 * A best-effort, dependency-free tokenizer — no highlighting library is bundled in this
 * project, so this covers the common cases (strings, comments, keywords, numbers) rather
 * than claiming full-fidelity language-aware highlighting.
 */
function highlight(code: string, lang: string): { text: string; cls: string }[] {
  const keywords = new Set(KEYWORDS[lang] ?? []);
  const tokens: { text: string; cls: string }[] = [];
  const pattern = /(\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code))) {
    if (match.index > last) tokens.push({ text: code.slice(last, match.index), cls: '' });
    const tok = match[0];
    let cls = '';
    if (tok.startsWith('//') || tok.startsWith('#')) cls = 'text-neutral-500 italic';
    else if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) cls = 'text-emerald-400';
    else if (/^\d/.test(tok)) cls = 'text-amber-300';
    else if (keywords.has(tok)) cls = 'text-sky-400';
    tokens.push({ text: tok, cls });
    last = match.index + tok.length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), cls: '' });
  return tokens;
}

export function CodeBlock({ lang, code, filename }: { lang: string; code: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const tokens = highlight(code, lang);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently, nothing to recover.
    }
  };

  return (
    <div className="my-5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <span className="text-xs font-medium text-neutral-400">{filename ?? LANG_LABEL[lang] ?? lang}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md px-2 py-1 text-xs font-medium text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="min-w-full px-4 py-3 text-[13px] leading-relaxed">
          <code className="font-mono text-neutral-200">
            {tokens.map((t, i) => (
              <span key={i} className={t.cls}>
                {t.text}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
