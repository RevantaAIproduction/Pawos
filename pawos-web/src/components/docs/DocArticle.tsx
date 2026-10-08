import Image from 'next/image';
import type { DocBlock, DocScreenshot, DocStatus } from '../../lib/docs/types';
import { CodeBlock } from './CodeBlock';

const STATUS_STYLE: Record<DocStatus, { label: string; cls: string }> = {
  implemented: { label: 'Implemented', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  partial: { label: 'Partially implemented', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  'not-implemented': { label: 'Not implemented', cls: 'border-neutral-300 bg-neutral-100 text-neutral-700' },
  'not-verified': { label: 'Not verified', cls: 'border-neutral-300 bg-neutral-100 text-neutral-700' },
  deprecated: { label: 'Deprecated', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
};

/**
 * A screenshot in its frame — or, until the image exists, a labelled slot of the same shape, so the
 * page reads the same either way and nothing shifts when the real capture is added.
 */
function Screenshot({ shot }: { shot: DocScreenshot }) {
  const frame = shot.portrait ? 'mx-auto max-w-[280px]' : 'w-full';
  return (
    <figure className="my-6">
      <div className={`${frame} overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 shadow-sm`}>
        {shot.src ? (
          <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} sizes={shot.portrait ? '280px' : '(min-width: 1024px) 720px, 100vw'} className="block h-auto w-full" />
        ) : (
          <div role="img" aria-label={`${shot.alt} (screenshot to be added)`} className="flex w-full flex-col items-center justify-center gap-1 px-4 text-center" style={{ aspectRatio: `${shot.width} / ${shot.height}` }}>
            <p className="text-sm font-medium text-neutral-600">Screenshot goes here</p>
            <p className="font-mono text-xs text-neutral-400">{shot.slot}</p>
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-center text-sm text-neutral-500">{shot.caption}</figcaption>
    </figure>
  );
}

function Callout({ tone, text }: { tone: 'note' | 'warning' | 'tip'; text: string }) {
  const style =
    tone === 'warning'
      ? { border: 'border-amber-200', bg: 'bg-amber-50', label: 'Warning', labelCls: 'text-amber-800' }
      : tone === 'tip'
        ? { border: 'border-sky-200', bg: 'bg-sky-50', label: 'Tip', labelCls: 'text-sky-800' }
        : { border: 'border-neutral-200', bg: 'bg-neutral-50', label: 'Note', labelCls: 'text-neutral-700' };
  return (
    <div className={`my-5 rounded-lg border ${style.border} ${style.bg} px-4 py-3`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${style.labelCls}`}>{style.label}</p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-700">{text}</p>
    </div>
  );
}

export function DocArticle({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="doc-article">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'lead':
            return (
              <p key={i} className="text-lg leading-relaxed text-neutral-700">
                {block.text}
              </p>
            );
          case 'heading': {
            const Tag = block.level === 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4';
            const size = block.level === 2 ? 'text-2xl mt-10' : block.level === 3 ? 'text-xl mt-8' : 'text-lg mt-6';
            return (
              <Tag key={i} id={block.id} className={`scroll-mt-24 font-semibold tracking-tight text-neutral-900 ${size}`}>
                {block.text}
              </Tag>
            );
          }
          case 'paragraph':
            return (
              <p key={i} className="mt-4 leading-relaxed text-neutral-700">
                {block.text}
              </p>
            );
          case 'list':
            return block.ordered ? (
              <ol key={i} className="mt-4 list-decimal space-y-2 pl-5 text-neutral-700">
                {block.items.map((item, j) => (
                  <li key={j} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="mt-4 list-disc space-y-2 pl-5 text-neutral-700">
                {block.items.map((item, j) => (
                  <li key={j} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            );
          case 'steps':
            return (
              <ol key={i} className="mt-4 space-y-3">
                {block.items.map((step, j) => (
                  <li key={j} className="flex gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                      {j + 1}
                    </span>
                    <div>
                      <p className="font-medium text-neutral-900">{step.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-neutral-600">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            );
          case 'code':
            return <CodeBlock key={i} lang={block.lang} code={block.code} filename={block.filename} />;
          case 'table':
            return (
              <div key={i} className="my-5 overflow-x-auto rounded-lg border border-neutral-200">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                      {block.headers.map((h, j) => (
                        <th key={j} className="px-4 py-2.5 text-left font-semibold text-neutral-700">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j} className="border-b border-neutral-100 last:border-0">
                        {row.map((cell, k) => (
                          <td key={k} className="px-4 py-2.5 align-top text-neutral-700">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'note':
            return <Callout key={i} tone="note" text={block.text} />;
          case 'warning':
            return <Callout key={i} tone="warning" text={block.text} />;
          case 'tip':
            return <Callout key={i} tone="tip" text={block.text} />;
          case 'status': {
            const s = STATUS_STYLE[block.status];
            return (
              <div key={i} className={`my-5 flex items-start gap-2 rounded-lg border px-4 py-3 ${s.cls}`}>
                <span className="mt-0.5 shrink-0 rounded-full border border-current px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                  {s.label}
                </span>
                <p className="text-sm leading-relaxed">{block.text}</p>
              </div>
            );
          }
          case 'screenshot':
            return <Screenshot key={i} shot={block.shot} />;
          case 'cards':
            // One column on a phone or a narrow window, side by side when there is room: three across, or two by two for four.
            return (
              <div key={i} className={`mt-6 grid grid-cols-1 gap-4 ${block.items.length === 4 ? 'sm:grid-cols-2' : 'lg:grid-cols-3'}`}>
                {block.items.map((card, j) => (
                  <section key={j} className="flex flex-col rounded-lg border border-neutral-200 bg-white p-5">
                    <h3 className="text-base font-semibold tracking-tight text-neutral-900">{card.title}</h3>
                    <p className="mt-1 text-sm font-medium text-neutral-700">{card.subtitle}</p>
                    <p className="mt-0.5 text-sm text-neutral-500">{card.detail}</p>
                    <ul className="mt-4 space-y-1.5 border-t border-neutral-100 pt-4 text-sm leading-relaxed text-neutral-700">
                      {card.points.map((point, k) => (
                        <li key={k}>{point}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            );
          case 'cta':
            return /^https:\/\//.test(block.href) ? (
              <div key={i} className="my-6 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-neutral-700">{block.text}</p>
                <a
                  href={block.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  {block.label}
                </a>
              </div>
            ) : null;
          case 'faq':
            return (
              <dl key={i} className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                {block.items.map((item, j) => (
                  <div key={j} className="p-4">
                    <dt className="font-medium text-neutral-900">{item.q}</dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-neutral-600">{item.a}</dd>
                  </div>
                ))}
              </dl>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
