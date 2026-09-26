import { describe, expect, it } from 'vitest';
import { buildWidgetDocument, parseWidgetMessage, safeWidgetLink, WIDGET_CSP } from './widgetDocument';
import { restoreConversationSnapshot } from './RestoreConversationAdapter';
import type { ConversationSession } from '../../shared/conversation/ConversationSessionTypes';
import { isSameWidgetContent, stripLeakedWidgetCode, widgetContentWords } from './widgetDocument';

describe('Widget code a model pasted into its reply never shows as text', () => {
  it.each([
    ['widget_code:<style>.a{}</style>', ''],
    ['<script src="https://cdnjs.cloudflare.com/x.js"></script>\n<style>', ''],
    ['Here is the chart.\n<svg viewBox="0 0 1 1"></svg>', 'Here is the chart.'],
    ['Here it is.\n```html\n<div></div>\n```', 'Here it is.'],
    ['Prices rise from $0 to $100 — Pro Max is 5x Pro.', 'Prices rise from $0 to $100 — Pro Max is 5x Pro.'],
  ])('%j', (input, expected) => expect(stripLeakedWidgetCode(input)).toBe(expected));
});

describe('Chat widgets (show_widget)', () => {
  it('wraps the code in a locked-down document: CSP first, no network, only the two script CDNs', () => {
    const doc = buildWidgetDocument('<svg viewBox="0 0 10 10"></svg>', 'w1');
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<svg'));
    expect(WIDGET_CSP).toContain("default-src 'none'");
    expect(WIDGET_CSP).toContain("connect-src 'none'");
    expect(WIDGET_CSP).toContain("form-action 'none'");
    expect(WIDGET_CSP).toContain("script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;");
    expect(doc).toContain('--text-primary');
  });

  it('starts in the app theme and carries both light and dark palettes', () => {
    expect(buildWidgetDocument('<p>x</p>', 'w1', 'light')).toContain('<html data-theme="light">');
    expect(buildWidgetDocument('<p>x</p>', 'w1')).toContain('<html data-theme="dark">');
    const doc = buildWidgetDocument('<p>x</p>', 'w1');
    expect(doc).toContain(':root[data-theme="light"]');
    expect(doc).toContain('--accent-bg');
  });

  it('accepts only its own well-formed messages; heights are clamped', () => {
    expect(parseWidgetMessage({ source: 'pawos-widget', id: 'w1', type: 'height', height: 99999 }, 'w1')).toEqual({ type: 'height', height: 2000 });
    expect(parseWidgetMessage({ source: 'pawos-widget', id: 'w1', type: 'ready' }, 'w1')).toEqual({ type: 'ready' });
    expect(parseWidgetMessage({ source: 'pawos-widget', id: 'w1', type: 'prompt', text: ' Tell me more ' }, 'w1')).toEqual({ type: 'prompt', text: 'Tell me more' });
    expect(parseWidgetMessage({ source: 'pawos-widget', id: 'other', type: 'height', height: 100 }, 'w1')).toBeNull();
    expect(parseWidgetMessage({ type: 'height', height: 100 }, 'w1')).toBeNull();
    expect(parseWidgetMessage('allow', 'w1')).toBeNull();
  });

  it('links: only http(s) ever leave a widget', () => {
    expect(parseWidgetMessage({ source: 'pawos-widget', id: 'w1', type: 'link', url: 'https://example.com/a' }, 'w1')).toEqual({ type: 'link', url: 'https://example.com/a' });
    expect(safeWidgetLink('javascript:alert(1)')).toBeNull();
    expect(safeWidgetLink('file:///C:/Windows/System32')).toBeNull();
    expect(parseWidgetMessage({ source: 'pawos-widget', id: 'w1', type: 'link', url: 'ms-settings:privacy' }, 'w1')).toBeNull();
  });

  it('a reopened chat shows its widgets where they were — before that turn\'s reply', () => {
    const session = {
      id: 's', title: 't', createdAt: 1, updatedAt: 2, pinned: false, archived: false, filesCreated: [], applicationsOpened: [],
      turns: [{
        id: 'turn1', startedAt: 1, endedAt: 2, transcript: 'chart my sales', assistantResponse: 'Sales doubled.',
        actionsExecuted: [], errors: [], model: 'm', voice: 'v', endedReason: 'completed',
        widgets: [{ title: 'sales_chart', code: '<svg></svg>', loadingMessages: ['Drawing bars'] }],
      }],
    } as ConversationSession;
    const messages = restoreConversationSnapshot(session)?.messages ?? [];
    expect(messages.map((m) => (m.widget ? `widget:${m.widget.title}` : `${m.role}:${m.content}`))).toEqual([
      'user:chart my sales',
      'widget:sales_chart',
      'assistant:Sales doubled.',
    ]);
  });
});

describe('Same visual twice vs a different visual', () => {
  const chart = (title: string, color: string) => `<style>.w{color:${color}}</style><div style="height:240px"><canvas id="c"></canvas></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script>new Chart(document.getElementById('c'), { type: 'bar', data: { labels: ['Go', 'Pro', 'Pro Max'], datasets: [{ label: '${title}', data: [0, 20, 100], backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--accent') }] }, options: { maintainAspectRatio: false } });</script>`;
  const flow = `<svg viewBox="0 0 680 120" width="100%"><rect x="10" y="40" width="140" height="40" rx="6"/><text x="80" y="64">Download</text><rect x="180" y="40" width="140" height="40" rx="6"/><text x="250" y="64">Sign in</text><text x="420" y="64">Pick plan</text><text x="590" y="64">Start chatting</text></svg>`;

  it('a restyled/retitled redraw of the same chart counts as the same visual', () => {
    expect(isSameWidgetContent(chart('Monthly price', 'red'), chart('Monthly price (USD)', 'blue'))).toBe(true);
  });

  it('a chart and a flow diagram from the same answer are different visuals', () => {
    expect(isSameWidgetContent(chart('Monthly price', 'red'), flow)).toBe(false);
    expect([...widgetContentWords(flow)]).toEqual(expect.arrayContaining(['download', 'sign', 'chatting']));
    expect(widgetContentWords(flow).has('680')).toBe(false); // markup attributes are not content
  });
});
