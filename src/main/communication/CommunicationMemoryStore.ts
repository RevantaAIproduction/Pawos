import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type {
  CompanyRecord,
  ParticipantRecord,
  ProjectRecord,
  RelationshipEdge,
  RelationshipNodeKind,
} from '../../shared/communication/CommunicationTypes';
import { communicationSessionStore } from './CommunicationSessionStore';
import { communicationIntelligenceStore } from './CommunicationIntelligenceStore';
import { computeRelationshipHealth, synthesizeRelationshipIntelligence, type RelationshipCommunicationInput } from './RelationshipIntelligence';

const CONTACTS_FILE_NAME = 'contacts.db';
const COMPANIES_FILE_NAME = 'companies.db';
const LEGACY_FILE_NAME = 'relationships.db';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Communication Memory (architecture doc §7) — the direct sibling of
 * WorkspaceMemoryStore/MemoryGraphStore: evidence-based entities the model
 * can query, never an opaque embedding blob. Split into two real files
 * (contacts.db for participants, companies.db for companies+projects) per
 * the desktop-first storage architecture — every other view (Unified
 * Timeline, Company Workspace, Relationship Graph edges) is a computed
 * projection over these plus CommunicationSessionStore's records, never a
 * second copy of the same fact.
 */
class CommunicationMemoryStore {
  private contactsFilePath = '';
  private companiesFilePath = '';
  private participants: ParticipantRecord[] = [];
  private companies: CompanyRecord[] = [];
  private projects: ProjectRecord[] = [];

  init(): void {
    const indexDir = path.join(app.getPath('userData'), 'communication', 'index');
    this.contactsFilePath = path.join(indexDir, CONTACTS_FILE_NAME);
    this.companiesFilePath = path.join(indexDir, COMPANIES_FILE_NAME);
    this.migrateLegacyFile(indexDir);
    this.load();
  }

  /** One-time migration from the old single relationships.db into the new split contacts.db/companies.db — real data preserved, never lost, never silently duplicated on repeat startups. */
  private migrateLegacyFile(indexDir: string): void {
    const legacyPath = path.join(indexDir, LEGACY_FILE_NAME);
    if (!fs.existsSync(legacyPath) || fs.existsSync(this.contactsFilePath) || fs.existsSync(this.companiesFilePath)) return;
    try {
      const raw = fs.readFileSync(legacyPath, 'utf-8');
      const parsed = JSON.parse(raw);
      fs.writeFileSync(this.contactsFilePath, JSON.stringify({ participants: Array.isArray(parsed.participants) ? parsed.participants : [] }, null, 2), 'utf-8');
      fs.writeFileSync(
        this.companiesFilePath,
        JSON.stringify({ companies: Array.isArray(parsed.companies) ? parsed.companies : [], projects: Array.isArray(parsed.projects) ? parsed.projects : [] }, null, 2),
        'utf-8'
      );
      fs.rmSync(legacyPath, { force: true });
    } catch {
      // Migration is best-effort — a corrupt legacy file just means we start fresh, same as any other load() failure.
    }
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.contactsFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.participants = (Array.isArray(parsed.participants) ? parsed.participants : []).map(withParticipantDefaults);
    } catch {
      this.participants = [];
    }
    try {
      const raw = fs.readFileSync(this.companiesFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.companies = (Array.isArray(parsed.companies) ? parsed.companies : []).map(withCompanyDefaults);
      this.projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    } catch {
      this.companies = [];
      this.projects = [];
    }
  }

  private saveContacts(): void {
    fs.mkdirSync(path.dirname(this.contactsFilePath), { recursive: true });
    fs.writeFileSync(this.contactsFilePath, JSON.stringify({ participants: this.participants }, null, 2), 'utf-8');
  }

  private saveCompanies(): void {
    fs.mkdirSync(path.dirname(this.companiesFilePath), { recursive: true });
    fs.writeFileSync(this.companiesFilePath, JSON.stringify({ companies: this.companies, projects: this.projects }, null, 2), 'utf-8');
  }

  getParticipant(id: string): ParticipantRecord | undefined {
    return this.participants.find((p) => p.id === id);
  }
  getCompany(id: string): CompanyRecord | undefined {
    return this.companies.find((c) => c.id === id);
  }
  getProject(id: string): ProjectRecord | undefined {
    return this.projects.find((p) => p.id === id);
  }
  listParticipants(): ParticipantRecord[] {
    return [...this.participants];
  }
  listCompanies(): CompanyRecord[] {
    return [...this.companies];
  }
  listProjects(): ProjectRecord[] {
    return [...this.projects];
  }

  findParticipantByName(name: string): ParticipantRecord | undefined {
    const normalized = name.trim().toLowerCase();
    return this.participants.find((p) => p.name.trim().toLowerCase() === normalized);
  }

  findCompanyByName(name: string): CompanyRecord | undefined {
    const normalized = name.trim().toLowerCase();
    return this.companies.find((c) => c.name.trim().toLowerCase() === normalized);
  }

  findProjectByName(name: string): ProjectRecord | undefined {
    const normalized = name.trim().toLowerCase();
    return this.projects.find((p) => p.name.trim().toLowerCase() === normalized);
  }

  upsertParticipant(input: { name: string; role?: string | null; companyId?: string | null; emails?: string[] }): ParticipantRecord {
    const existing = this.findParticipantByName(input.name);
    const now = Date.now();
    if (existing) {
      existing.lastSeenAt = now;
      if (input.role) existing.role = input.role;
      if (input.companyId) existing.companyId = input.companyId;
      if (input.emails) existing.emails = [...new Set([...existing.emails, ...input.emails])];
      return existing;
    }
    const created: ParticipantRecord = {
      id: newId('participant'),
      name: input.name,
      role: input.role ?? null,
      companyId: input.companyId ?? null,
      emails: input.emails ?? [],
      phones: [],
      externalHandles: [],
      firstSeenAt: now,
      lastSeenAt: now,
      communicationIds: [],
      relationshipHealth: null,
      frequentTopics: [],
      communicationStyle: null,
      interests: [],
    };
    this.participants.push(created);
    return created;
  }

  upsertCompany(name: string, domain?: string | null): CompanyRecord {
    const existing = this.findCompanyByName(name);
    if (existing) {
      if (domain) existing.domain = domain;
      return existing;
    }
    const created: CompanyRecord = {
      id: newId('company'),
      name,
      domain: domain ?? null,
      participantIds: [],
      communicationIds: [],
      projectIds: [],
      relationshipHealth: null,
      frequentTopics: [],
      risks: [],
      opportunities: [],
    };
    this.companies.push(created);
    return created;
  }

  upsertProject(name: string): ProjectRecord {
    const existing = this.findProjectByName(name);
    if (existing) return existing;
    const created: ProjectRecord = { id: newId('project'), name, companyIds: [], communicationIds: [] };
    this.projects.push(created);
    return created;
  }

  /**
   * The one write path that links a communication to entities — called
   * once per communication (at creation and again after the Intelligence
   * Layer identifies participants/companies/projects from the transcript).
   * Every cross-reference array is deduplicated in place; this is the
   * single source of truth the Relationship Graph (§10) projects from.
   */
  linkCommunication(input: {
    communicationId: string;
    participantNames?: string[];
    companyName?: string | null;
    projectName?: string | null;
  }): { participantIds: string[]; companyId: string | null; projectId: string | null } {
    let companyId: string | null = null;
    if (input.companyName) {
      const company = this.upsertCompany(input.companyName);
      if (!company.communicationIds.includes(input.communicationId)) company.communicationIds.push(input.communicationId);
      companyId = company.id;
    }

    const participantIds: string[] = [];
    for (const name of input.participantNames ?? []) {
      const participant = this.upsertParticipant({ name, companyId });
      if (!participant.communicationIds.includes(input.communicationId)) participant.communicationIds.push(input.communicationId);
      if (companyId && !this.getCompany(companyId)!.participantIds.includes(participant.id)) {
        this.getCompany(companyId)!.participantIds.push(participant.id);
      }
      participantIds.push(participant.id);
    }

    let projectId: string | null = null;
    if (input.projectName) {
      const project = this.upsertProject(input.projectName);
      if (!project.communicationIds.includes(input.communicationId)) project.communicationIds.push(input.communicationId);
      if (companyId) {
        if (!project.companyIds.includes(companyId)) project.companyIds.push(companyId);
        const company = this.getCompany(companyId)!;
        if (!company.projectIds.includes(project.id)) company.projectIds.push(project.id);
      }
      projectId = project.id;
    }

    this.saveContacts();
    this.saveCompanies();
    return { participantIds, companyId, projectId };
  }

  /** Real communications actually linked to this entity, with their real summary data — the shared input both recompute methods below feed into synthesizeRelationshipIntelligence. */
  private linkedCommunicationInputs(communicationIds: string[]): RelationshipCommunicationInput[] {
    return communicationIds
      .map((id) => {
        const record = communicationSessionStore.get(id);
        const summary = communicationIntelligenceStore.getSummary(id);
        if (!record || !summary) return null;
        return { id, startedAt: record.startedAt, headline: summary.headline, summary: summary.summary, keyPoints: summary.keyPoints };
      })
      .filter((x): x is RelationshipCommunicationInput => x !== null);
  }

  /** Real, evidence-based recompute — called once per participant right after a new communication links to them (CommunicationPipeline's updatingMemory stage), never on every read. Deterministic relationship health always updates; the Gemini-based topic/style/interest synthesis is skipped (fields left as-is) if apiKey is unavailable, rather than blocking the pipeline. */
  async recomputeParticipantIntelligence(participantId: string, apiKey: string | undefined): Promise<void> {
    const participant = this.getParticipant(participantId);
    if (!participant) return;
    const inputs = this.linkedCommunicationInputs(participant.communicationIds);
    participant.relationshipHealth = computeRelationshipHealth(inputs.map((i) => i.startedAt));
    if (apiKey) {
      try {
        const synthesis = await synthesizeRelationshipIntelligence({ apiKey, entityName: participant.name, communications: inputs });
        participant.frequentTopics = synthesis.frequentTopics.map((t) => ({
          topic: t.topic,
          mentionCount: t.evidenceCommunicationIds.length,
          lastMentionedAt: Math.max(...t.evidenceCommunicationIds.map((id) => inputs.find((i) => i.id === id)?.startedAt ?? 0)),
          evidenceCommunicationIds: t.evidenceCommunicationIds,
        }));
        participant.communicationStyle = synthesis.communicationStyle;
        participant.interests = synthesis.interests;
      } catch {
        // Synthesis is a best-effort enhancement — relationship health (already set above) is the real, always-available signal; a failed synthesis call never blocks the pipeline.
      }
    }
    this.saveContacts();
  }

  /** Company counterpart — risks/opportunities are aggregated from the REAL CommunicationSignal records already extracted per-session (kind 'risk' -> risk, kind 'buyingSignal' -> opportunity), never a second AI call for something already evidenced. */
  async recomputeCompanyIntelligence(companyId: string, apiKey: string | undefined): Promise<void> {
    const company = this.getCompany(companyId);
    if (!company) return;
    const inputs = this.linkedCommunicationInputs(company.communicationIds);
    company.relationshipHealth = computeRelationshipHealth(inputs.map((i) => i.startedAt));

    const allSignals = company.communicationIds.flatMap((id) => communicationIntelligenceStore.getSignals(id));
    company.risks = allSignals
      .filter((s) => s.kind === 'risk')
      .map((s) => ({ description: s.evidence, evidenceCommunicationId: s.communicationId, atSeconds: s.atSeconds }));
    company.opportunities = allSignals
      .filter((s) => s.kind === 'buyingSignal')
      .map((s) => ({ description: s.evidence, evidenceCommunicationId: s.communicationId, atSeconds: s.atSeconds }));

    if (apiKey) {
      try {
        const synthesis = await synthesizeRelationshipIntelligence({ apiKey, entityName: company.name, communications: inputs });
        company.frequentTopics = synthesis.frequentTopics.map((t) => ({
          topic: t.topic,
          mentionCount: t.evidenceCommunicationIds.length,
          lastMentionedAt: Math.max(...t.evidenceCommunicationIds.map((id) => inputs.find((i) => i.id === id)?.startedAt ?? 0)),
          evidenceCommunicationIds: t.evidenceCommunicationIds,
        }));
      } catch {
        // Best-effort — risks/opportunities/relationship health above are already real and saved regardless.
      }
    }
    this.saveCompanies();
  }

  /**
   * Relationship Graph (architecture doc §10) — a computed projection over
   * the entity cross-reference arrays above, never a separately-maintained
   * mutable structure. Returns every edge touching the given node.
   */
  getRelationships(nodeId: string, kind: RelationshipNodeKind): RelationshipEdge[] {
    const edges: RelationshipEdge[] = [];

    if (kind === 'participant') {
      const participant = this.getParticipant(nodeId);
      if (participant?.companyId) {
        edges.push({ kind: 'participantWorksAt', from: { kind: 'participant', id: nodeId }, to: { kind: 'company', id: participant.companyId }, evidenceCommunicationId: participant.communicationIds[0] ?? null });
      }
      for (const commId of participant?.communicationIds ?? []) {
        edges.push({ kind: 'participantInCommunication', from: { kind: 'participant', id: nodeId }, to: { kind: 'communication', id: commId }, evidenceCommunicationId: commId });
      }
    }

    if (kind === 'company') {
      const company = this.getCompany(nodeId);
      for (const participantId of company?.participantIds ?? []) {
        edges.push({ kind: 'participantWorksAt', from: { kind: 'participant', id: participantId }, to: { kind: 'company', id: nodeId }, evidenceCommunicationId: null });
      }
      for (const projectId of company?.projectIds ?? []) {
        edges.push({ kind: 'projectForCompany', from: { kind: 'project', id: projectId }, to: { kind: 'company', id: nodeId }, evidenceCommunicationId: null });
      }
      for (const commId of company?.communicationIds ?? []) {
        edges.push({ kind: 'communicationMentionsCompany', from: { kind: 'communication', id: commId }, to: { kind: 'company', id: nodeId }, evidenceCommunicationId: commId });
      }
    }

    if (kind === 'project') {
      const project = this.getProject(nodeId);
      for (const companyId of project?.companyIds ?? []) {
        edges.push({ kind: 'projectForCompany', from: { kind: 'project', id: nodeId }, to: { kind: 'company', id: companyId }, evidenceCommunicationId: null });
      }
      for (const commId of project?.communicationIds ?? []) {
        edges.push({ kind: 'communicationAboutProject', from: { kind: 'communication', id: commId }, to: { kind: 'project', id: nodeId }, evidenceCommunicationId: commId });
      }
    }

    if (kind === 'communication') {
      for (const participant of this.participants) {
        if (participant.communicationIds.includes(nodeId)) {
          edges.push({ kind: 'participantInCommunication', from: { kind: 'participant', id: participant.id }, to: { kind: 'communication', id: nodeId }, evidenceCommunicationId: nodeId });
        }
      }
      for (const project of this.projects) {
        if (project.communicationIds.includes(nodeId)) {
          edges.push({ kind: 'communicationAboutProject', from: { kind: 'communication', id: nodeId }, to: { kind: 'project', id: project.id }, evidenceCommunicationId: nodeId });
        }
      }
      for (const company of this.companies) {
        if (company.communicationIds.includes(nodeId)) {
          edges.push({ kind: 'communicationMentionsCompany', from: { kind: 'communication', id: nodeId }, to: { kind: 'company', id: company.id }, evidenceCommunicationId: nodeId });
        }
      }
    }

    return edges;
  }
}

/** Back-fills the new relationship-intelligence fields for records saved before this pass — never null-crashes older data. Input typed as Partial since older on-disk JSON genuinely may not have these fields yet, regardless of what the current type declares. */
function withParticipantDefaults(p: Partial<ParticipantRecord>): ParticipantRecord {
  return { relationshipHealth: null, frequentTopics: [], communicationStyle: null, interests: [], ...p } as ParticipantRecord;
}
function withCompanyDefaults(c: Partial<CompanyRecord>): CompanyRecord {
  return { relationshipHealth: null, frequentTopics: [], risks: [], opportunities: [], ...c } as CompanyRecord;
}

export const communicationMemoryStore = new CommunicationMemoryStore();
