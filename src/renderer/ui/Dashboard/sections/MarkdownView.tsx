import React from 'react';
import styles from '../dashboard.module.css';

/**
 * Minimal, dependency-free Markdown renderer for Work Record text (Final
 * Result / Plan / Architecture). No markdown-rendering library exists
 * anywhere in this app's dependency tree — this covers exactly the subset
 * PawOS's own model output actually uses (headings, bold/italic/inline
 * code, bullet/numbered lists, fenced code blocks, paragraphs), not a
 * general-purpose CommonMark implementation.
 */

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; text: string };

const FENCE_RE = /^```(\w*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const at = (idx: number): string => lines[idx] ?? '';
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = at(i);

    if (line.trim() === '') {
      i++;
      continue;
    }

    if (FENCE_RE.test(line.trim())) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && at(i).trim() !== '```') {
        codeLines.push(at(i));
        i++;
      }
      i++; // skip closing fence (or end of input)
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: (heading[1] ?? '#').length, text: (heading[2] ?? '').trim() });
      i++;
      continue;
    }

    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = BULLET_RE.exec(at(i));
        if (!m) break;
        items.push(m[1] ?? '');
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (ORDERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = ORDERED_RE.exec(at(i));
        if (!m) break;
        items.push(m[1] ?? '');
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      at(i).trim() !== '' &&
      !FENCE_RE.test(at(i).trim()) &&
      !HEADING_RE.test(at(i)) &&
      !BULLET_RE.test(at(i)) &&
      !ORDERED_RE.test(at(i))
    ) {
      paraLines.push(at(i).trim());
      i++;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
  }

  return blocks;
}

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

export function renderInlineMarkdown(text: string, keyPrefix = ''): React.ReactNode[] {
  return text
    .split(INLINE_RE)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const key = `${keyPrefix}${index}`;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code key={key} className={styles.inlineCode}>
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
}

export function MarkdownView({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseBlocks(text || ''), [text]);
  if (blocks.length === 0) return null;

  return (
    <div className={styles.markdownView}>
      {blocks.map((block, index) => {
        const key = `md-${index}`;
        if (block.type === 'heading') {
          const level = Math.min(block.level + 2, 6);
          const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
          return (
            <HeadingTag key={key} className={styles.markdownHeading}>
              {renderInlineMarkdown(block.text, `${key}-`)}
            </HeadingTag>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={key} className={styles.markdownList}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-${itemIndex}-`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={key} className={styles.markdownList}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-${itemIndex}-`)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === 'code') {
          return (
            <pre key={key} className={styles.markdownCodeBlock}>
              <code>{block.text}</code>
            </pre>
          );
        }
        return (
          <p key={key} className={styles.markdownParagraph}>
            {renderInlineMarkdown(block.text, `${key}-`)}
          </p>
        );
      })}
    </div>
  );
}
