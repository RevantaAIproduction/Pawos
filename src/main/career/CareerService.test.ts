import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
const saveDialog = vi.fn();
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn) },
  dialog: { showSaveDialog: (...args: unknown[]) => saveDialog(...args), showOpenDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  BrowserWindow: { fromWebContents: () => undefined },
  app: { getPath: () => '' },
}));

import { registerCareerIpc } from '../ipc/handlers/careerHandler';
import { runCareerTool, normalizeAtsReport } from './CareerService';
import { buildAccessStore } from '../billing/BuildAccessStore';
import { subscriptionStore } from '../billing/SubscriptionStore';
import { usageEventStore } from '../billing/UsageEventStore';
import { creditStore } from '../billing/CreditStore';
import { rollingUsageGate } from '../billing/RollingUsageGate';
import * as geminiJson from '../ai/geminiJson';
import * as fsPromises from 'fs/promises';
import { readDocument } from '../execution/plugins/documentReaders';
import * as os from 'os';
import * as path from 'path';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

const HOUR = 60 * 60 * 1000;
const RESUME = 'Priya Sharma\npriya@example.com\nB.Tech Computer Science, 2026\n' + 'Built a React dashboard for a college club with 400 users; used TypeScript, Node.js and PostgreSQL. '.repeat(4);
const JD = 'We are hiring a Frontend Developer Intern with React, TypeScript, REST APIs, Git and testing experience. '.repeat(2);

function grantBuild() {
  buildAccessStore.set({ status: 'active', cohortId: 'build-2026', startsAt: Date.now() - HOUR, endsAt: Date.now() + 60 * 24 * HOUR, revokedAt: null, syncedAt: Date.now() });
}

function usageRecord(normalizedCompute: number): NormalizedUsageRecord {
  return {
    usageEventId: 'evt-career',
    requestId: 'req-career',
    sessionId: null,
    runId: null,
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    requestType: 'conversationTurn',
    inputTokens: 1000,
    outputTokens: 500,
    cachedInputTokens: 0,
    totalTokens: 1500,
    thoughtsTokens: null,
    normalizedCompute: normalizedCompute * 10,
    activeDurationMs: 4000,
    timestamp: Date.now(),
  } as NormalizedUsageRecord;
}

describe('Career tools (PawOS Build student features)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    handlers.clear();
    registerCareerIpc();
    buildAccessStore.clear();
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({ tier: 'go', status: 'none' } as any);
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    vi.spyOn(usageEventStore, 'getActiveWindowStartAt').mockReturnValue(Date.now() - HOUR);
    vi.spyOn(usageEventStore, 'getWeeklyCycleStartAt').mockReturnValue(Date.now() - HOUR);
    vi.spyOn(usageEventStore, 'getGoCycleStatus').mockReturnValue({ cycleStartAt: Date.now() - HOUR, refreshesUsed: 0 });
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({ purchasedUsageCreditsUsd: 0 } as any);
    while (rollingUsageGate.inflightCount > 0) rollingUsageGate.releaseSlot();
  });

  afterEach(() => {
    buildAccessStore.clear();
    vi.restoreAllMocks();
  });

  it('refuses every tool for an account without the career features (e.g. Paw Go)', async () => {
    const generate = vi.spyOn(geminiJson, 'generateJsonDetailed');
    const result = await handlers.get('career:run')!({}, { tool: 'atsScore', input: { resumeText: RESUME, jobDescription: JD } });
    expect(result).toMatchObject({ ok: false, code: 'not-entitled' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('validates input before spending any Paw Compute', async () => {
    grantBuild();
    const generate = vi.fn();
    expect(await runCareerTool({ tool: 'atsScore', input: { resumeText: 'too short', jobDescription: JD } }, generate)).toMatchObject({ ok: false, code: 'invalid-input' });
    expect(await runCareerTool({ tool: 'generateResume', input: { fullName: 'A', contact: '', targetRole: '', education: '', experience: '', projects: '', skills: '', achievements: '' } }, generate)).toMatchObject({ ok: false, code: 'invalid-input' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('is blocked by the same Build capacity limits as chat (no AI call when exhausted)', async () => {
    grantBuild();
    // Inside the current Build week (which starts at the grant, 1 hour ago).
    vi.spyOn(usageEventStore, 'list').mockReturnValue([{ ...usageRecord(1500), timestamp: Date.now() - HOUR / 2 }]);
    const generate = vi.fn();
    const result = await runCareerTool({ tool: 'atsScore', input: { resumeText: RESUME, jobDescription: JD } }, generate);
    expect(result).toMatchObject({ ok: false, code: 'usage-limit' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('runs ATS scoring as an interactive, metered request and normalizes the report', async () => {
    grantBuild();
    const consume = vi.spyOn(creditStore, 'consume').mockImplementation(() => {});
    let inflightDuringCall = -1;
    const generate = vi.fn(async (params: any) => {
      inflightDuringCall = rollingUsageGate.inflightCount;
      expect(params.requestType).toBe('conversationTurn');
      expect(params.prompt).toContain('JOB DESCRIPTION');
      expect(params.prompt).toContain('Never invent');
      return {
        ok: true as const,
        usageRecord: usageRecord(12),
        data: { overallScore: 142, verdict: 'Good match', matchedKeywords: ['React', 'TypeScript'], missingKeywords: ['testing'], sectionScores: [{ section: 'Skills', score: 80, feedback: 'Add testing' }], formattingIssues: [], recommendations: ['Add Jest'] },
      };
    });

    const result = await runCareerTool({ tool: 'atsScore', input: { resumeText: RESUME, jobDescription: JD } }, generate);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tool).toBe('atsScore');
      expect((result.data as any).overallScore).toBe(100); // clamped to 0-100
      expect((result.data as any).missingKeywords).toEqual(['testing']);
    }
    expect(inflightDuringCall).toBe(1); // held an in-flight generation slot for the duration
    expect(rollingUsageGate.inflightCount).toBe(0); // and released it
    expect(consume).toHaveBeenCalledWith(expect.any(Number), 'career:atsScore', 'chat', false, false, 'evt-career');
  });

  it('reports AI failures honestly and still releases the slot', async () => {
    grantBuild();
    const result = await runCareerTool(
      { tool: 'careerGuidance', input: { resumeText: RESUME, targetRole: '', location: 'Bengaluru', experienceLevel: 'fresher' } },
      vi.fn(async () => ({ ok: false as const, reason: 'The AI service rejected the request (HTTP 429)', usageRecord: null }))
    );
    expect(result).toEqual({ ok: false, code: 'ai-error', reason: 'The AI service rejected the request (HTTP 429)' });
    expect(rollingUsageGate.inflightCount).toBe(0);
  });

  it('normalizes malformed model output into the declared shape', () => {
    const report = normalizeAtsReport({ overallScore: 'abc', matchedKeywords: 'React', sectionScores: [null, { section: 'X', score: -5 }] });
    expect(report.overallScore).toBe(0);
    expect(report.matchedKeywords).toEqual([]);
    expect(report.sectionScores).toEqual([{ section: 'X', score: 0, feedback: '' }]);
  });

  it('exports a real PDF to the path the user chose', async () => {
    const target = path.join(os.tmpdir(), `pawos-career-${Date.now()}.pdf`);
    saveDialog.mockResolvedValueOnce({ canceled: false, filePath: target });
    const result = await handlers.get('career:exportPdf')!({ sender: {} }, { title: 'Priya Sharma — Resume', subtitle: 'priya@example.com • +91 98', sections: [{ heading: 'Skills', paragraphs: ['React, TypeScript'] }] }, 'Priya Resume');
    expect(result).toEqual({ ok: true, filePath: target });
    const bytes = await fsPromises.readFile(target);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    await fsPromises.unlink(target);
  });

  it('exports a real Word .docx to the path the user chose — readable back with the name, contact line and sections', async () => {
    const target = path.join(os.tmpdir(), `pawos-career-${Date.now()}.docx`);
    saveDialog.mockResolvedValueOnce({ canceled: false, filePath: target });
    const result = await handlers.get('career:exportDocx')!(
      { sender: {} },
      { title: 'Priya Sharma', subtitle: 'priya@example.com · +91 98', sections: [{ heading: 'Skills', paragraphs: ['React, TypeScript'] }, { heading: 'Education', paragraphs: ['B.Tech CS, VIT — 2021'] }] },
      'Priya Sharma — Resume'
    );
    expect(result).toEqual({ ok: true, filePath: target });
    expect(saveDialog.mock.calls.at(-1)?.[1]).toMatchObject({ defaultPath: 'Priya Sharma — Resume.docx', filters: [{ name: 'Word document', extensions: ['docx'] }] });
    const bytes = await fsPromises.readFile(target);
    expect(bytes.subarray(0, 2).toString()).toBe('PK'); // a real .docx is a zip package
    const read = await readDocument(target, 'docx', 10_000);
    for (const text of ['Priya Sharma', 'priya@example.com · +91 98', 'Skills', 'React, TypeScript', 'Education', 'B.Tech CS, VIT — 2021']) {
      expect(read.content).toContain(text);
    }
    await fsPromises.unlink(target);
  });

  it('Word export returns canceled without writing when the user cancels', async () => {
    saveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });
    const result = await handlers.get('career:exportDocx')!({ sender: {} }, { title: 'x', sections: [] }, 'x');
    expect(result).toEqual({ ok: false, canceled: true });
  });

  it('PDF export returns canceled without writing when the user cancels', async () => {
    saveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });
    const result = await handlers.get('career:exportPdf')!({ sender: {} }, { title: 'x', sections: [] }, 'x');
    expect(result).toEqual({ ok: false, canceled: true });
  });
});
