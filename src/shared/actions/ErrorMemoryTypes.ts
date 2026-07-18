export type ErrorMemoryEntry = {
  id: string;
  workspaceRoot: string;
  problem: string;
  cause: string;
  solution: string;
  filesChanged: string[];
  commandsUsed: string[];
  verification: string;
  occurredAt: number;
};
