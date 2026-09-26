/**
 * Live Preview — shared shapes. Phase 1 defines only what the finding classifier produces; the
 * preview lifecycle/report types are added with the Live Preview service (Phase 2).
 */

export type PreviewFindingKind =
  /** Uncaught exception / unhandled rejection, renderer crash, framework error overlay, blank page. */
  | 'runtime-crash'
  /** console.error from the app's own code (known tooling noise filtered out). */
  | 'console-error'
  /** XHR/Fetch that failed: 5xx, 404, or a network failure. */
  | 'api-failure'
  /** A page asset (script, stylesheet, image, font, document) that failed to load. */
  | 'asset-failure'
  /** An error the dev server printed (compile error, server exception). */
  | 'dev-server-error'
  /** The dev server couldn't bind its port. */
  | 'port-in-use'
  /** The dev server process exited or crashed. */
  | 'dev-server-exited'
  /** Behaviour that is most likely intended (401/403 when signed out, 400/422 validation) or non-breaking warnings. */
  | 'expected';

export type PreviewFinding = {
  kind: PreviewFindingKind;
  /** 'error' = PawOS should fix it; 'note' = reported, never auto-fixed. */
  severity: 'error' | 'note';
  summary: string;
  detail?: string;
  /** The app's own source file (absolute when the project folder is known) the problem points at. */
  source?: { file: string; line?: number; column?: number };
  url?: string;
  status?: number | null;
  /** What the self-tester had just done when it appeared ("initial load", "clicked 'Save'"). */
  trigger?: string;
  /** Stable identity for de-duplication across signals and rounds. */
  key: string;
};
