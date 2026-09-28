/**
 * Ticket evidence — optional before/after proof captured during a ticket run (autonomous or in chat).
 *
 * Evidence is never required: it's captured only when it helps (a layout change, or locating a problem
 * the code alone can't pin down), and an unavailable capture environment never fails a ticket.
 * Verification and billing are independent of it.
 */

/** What kind of app the project is — decides which capture providers apply. */
export type EvidenceAppKind = 'web' | 'desktop' | 'android' | 'ios' | 'backend';

/** The capture providers. 'output' is text/log evidence — never presented as a screenshot. */
export type EvidenceProviderId = 'web' | 'desktopWindow' | 'android' | 'iosSimulator' | 'output';

export type EvidencePhase = 'before' | 'after';

/** Where to capture from — one shape per provider. */
export type EvidenceTarget =
  /** A page in PawOS's hidden browser (local dev server or a deployed URL). */
  | { provider: 'web'; url: string }
  /** The window(s) of an app PawOS itself started — identified by PawOS's process id, never "the active window". */
  | { provider: 'desktopWindow'; processId: string; windowTitle?: string }
  /** An Android emulator or USB device via adb; serial optional when exactly one device is connected. */
  | { provider: 'android'; serial?: string }
  /** A booted iOS Simulator via xcrun simctl (macOS only); udid optional when exactly one is booted. */
  | { provider: 'iosSimulator'; udid?: string }
  /** A command's output (tests, a CLI, a job), or a local API response. */
  | { provider: 'output'; command: string; cwd: string }
  | { provider: 'output'; httpUrl: string; method?: 'GET' | 'POST'; body?: string };

export type EvidenceCaptureRequest = {
  phase: EvidencePhase;
  /** Short human label, e.g. "Checkout page overflows on mobile". */
  label: string;
  target: EvidenceTarget;
  /** The autonomous run this belongs to, when captured during one — lets the run record reference it later. */
  runId?: string;
};

/** Whether a provider can capture on this machine right now. `verified` = exercised on this platform by PawOS's own tests. */
export type EvidenceProviderAvailability = {
  provider: EvidenceProviderId;
  available: boolean;
  verified: boolean;
  /** Why it's unavailable (or a caveat), in plain words. */
  detail: string;
};

export type OutputEvidence = {
  /** What produced it — the command, or "GET http://localhost:3000/api/x". */
  source: string;
  /** Exit code for a command; HTTP status for an API call. */
  status: number | null;
  /** The (trimmed) output text itself. */
  text: string;
  timedOut?: boolean;
};

/** One captured piece of evidence. Images and output are saved to disk; the chat gets the image inline. */
export type EvidenceItem = {
  id: string;
  phase: EvidencePhase;
  label: string;
  provider: EvidenceProviderId;
  kind: 'image' | 'output';
  capturedAt: number;
  /** Absolute path of the saved PNG (image) or .txt (output). */
  filePath: string;
  /** What was captured, for the caption — a URL, a window title, a device, a command. */
  targetDescription: string;
  output?: OutputEvidence;
  /** Real signals captured alongside a web screenshot (console errors, failed requests). */
  pageSignals?: { title: string; consoleErrors: string[]; failedRequests: string[] };
  runId?: string;
};

/** The ActionResult data of a successful captureEvidence. `imageBase64` is for the chat only — never sent to the model. */
export type EvidenceCaptureData = { evidence: EvidenceItem; imageBase64?: string };
