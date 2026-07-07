export type RelationshipType =
  | 'friends'
  | 'mentors'
  | 'studyTogether'
  | 'talksTogether'
  | 'reactsToEachOther';

export type Relationship = {
  type: RelationshipType;
  companionA: string;
  companionB: string;
  strength: number; // 0..1
  lastUpdatedAtMs?: number;
};

export class RelationshipEngine {
  private rels: Relationship[] = [];

  upsert(rel: Relationship) {
    const idx = this.rels.findIndex(
      (r) => r.type === rel.type && r.companionA === rel.companionA && r.companionB === rel.companionB
    );
    const now = Date.now();
    const normalized = { ...rel, lastUpdatedAtMs: rel.lastUpdatedAtMs ?? now };
    if (idx >= 0) this.rels[idx] = normalized;
    else this.rels.push(normalized);
  }

  getFor(companionId: string): Relationship[] {
    return this.rels.filter((r) => r.companionA === companionId || r.companionB === companionId);
  }
}

