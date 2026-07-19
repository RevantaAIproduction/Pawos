/**
 * Documentation-as-code: the store (MemoryGraphStore) never validates
 * against this list — Relation stays an open string so nothing here ever
 * needs to change for a new runtime to add its own verb. This file exists
 * so every runtime imports the same constants instead of inventing
 * synonyms ("generatedFrom" vs "createdFrom" vs "fromMeeting" for the same
 * concept), which is what keeps cross-runtime graph queries joinable.
 */
export const RELATION = {
  // Provenance — where something came from, why it exists.
  CREATED_BY: 'createdBy',
  GENERATED_FROM: 'generatedFrom',
  DERIVED_FROM: 'derivedFrom',
  USES: 'uses',
  IMPORTED_FROM: 'importedFrom',
  DOWNLOADED_FROM: 'downloadedFrom',
  REFERENCED_IN: 'referencedIn',
  VISITED: 'visited',
  APPROVED_BY: 'approvedBy',
  SHARED_WITH: 'sharedWith',
  // Structural — how entities relate to each other.
  BELONGS_TO: 'belongsTo',
  RELATES_TO: 'relatesTo',
  ATTENDED_BY: 'attendedBy',
  OWNED_BY: 'ownedBy',
  SCHEDULED_FOR: 'scheduledFor',
  // Infrastructure Awareness — how repositories/services/deployments/
  // clusters/databases/domains relate to each other.
  DEPLOYS_TO: 'deploysTo',
  RUNS_ON: 'runsOn',
  EXPOSED_VIA: 'exposedVia',
  MONITORED_BY: 'monitoredBy',
  DEPENDS_ON: 'dependsOn',
  CONTAINS: 'contains',
  ROUTES_TO: 'routesTo',
} as const;

export type RelationName = (typeof RELATION)[keyof typeof RELATION];
