import * as fs from 'fs';
import * as crypto from 'crypto';
import { generateJson } from '../../ai/geminiJson';
import { readDocument } from './documentReaders';
import { upsertFileEntity, type FileAttributes, type FileDocType } from '../../memory/entities/fileEntities';
import { buildReasoningSummary, type Entity, type EvidenceItem } from '../../memory/MemoryGraphStore';

const DOC_TYPES: FileDocType[] = [
  'resume', 'proposal', 'invoice', 'contract', 'meeting-notes', 'presentation', 'design', 'research', 'code', 'requirements', 'other',
];

const CLASSIFY_PREVIEW_CHARS = 4000;

type ClassificationResponse = {
  docType: FileDocType;
  summary: string;
  tags: string[];
  mentions: { people: string[]; clients: string[]; projects: string[] };
  evidenceQuotes: string[];
  confidence: number;
};

/**
 * Reads a file's content (via documentReaders.ts) and classifies it with
 * Gemini's JSON mode — docType/summary/tags/mentions, so "find my resume"
 * matches CV.docx/Curriculum Vitae.docx regardless of filename. Every
 * evidence quote the model returns is verified as a literal substring of
 * the real content BEFORE being stored — an unverifiable quote is
 * dropped, never trusted. This is the concrete mechanism behind "never
 * invent evidence": enforced by a string-containment check, not the
 * model's word for it.
 */
export async function classifyAndIndexFile(filePath: string): Promise<Entity | null> {
  let content: string;
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) return null;
    const read = await readDocument(filePath, 'auto', CLASSIFY_PREVIEW_CHARS);
    content = read.content;
  } catch {
    return null;
  }

  if (!content.trim()) return null;

  const prompt = `Classify this document. Return its type (one of: ${DOC_TYPES.join(', ')}), a one-sentence summary, up to 5 tags, any people/clients/projects it mentions by name, and up to 4 short EXACT quotes from the text below that justify your classification (these must be copied verbatim from the document — not paraphrased). Also return a confidence from 0 to 1.\n\nDocument content:\n"""\n${content}\n"""`;

  const result = await generateJson<ClassificationResponse>({
    prompt,
    schema: {
      type: 'object',
      properties: {
        docType: { type: 'string', enum: DOC_TYPES },
        summary: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        mentions: {
          type: 'object',
          properties: {
            people: { type: 'array', items: { type: 'string' } },
            clients: { type: 'array', items: { type: 'string' } },
            projects: { type: 'array', items: { type: 'string' } },
          },
        },
        evidenceQuotes: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' },
      },
      required: ['docType', 'summary', 'tags', 'mentions', 'evidenceQuotes', 'confidence'],
    },
  });

  if (!result) return null;

  // Verify every quote actually occurs in the real content — drop anything that doesn't.
  const verifiedEvidence: EvidenceItem[] = result.evidenceQuotes
    .filter((quote) => quote.trim().length > 0 && content.includes(quote))
    .map((quote) => ({ source: 'fileContent', detail: `Document text contains: "${quote}"`, refId: filePath }));

  // Confidence can only be as strong as what's actually verifiable — an unverified claim doesn't get to keep the model's self-reported number.
  const confidence = verifiedEvidence.length > 0 ? Math.min(result.confidence, 1) : 0;

  const contentHash = crypto.createHash('sha256').update(content).digest('hex');
  const attributes: FileAttributes = {
    path: filePath,
    docType: DOC_TYPES.includes(result.docType) ? result.docType : 'other',
    summary: result.summary,
    tags: result.tags ?? [],
    mentions: {
      people: result.mentions?.people ?? [],
      clients: result.mentions?.clients ?? [],
      projects: result.mentions?.projects ?? [],
    },
    contentHash,
    mtime: (await fs.promises.stat(filePath)).mtimeMs,
    lastIndexedAt: Date.now(),
  };

  return upsertFileEntity(
    attributes,
    verifiedEvidence.length > 0
      ? { confidence, evidence: verifiedEvidence, reasoningSummary: buildReasoningSummary(verifiedEvidence) }
      : undefined
  );
}
