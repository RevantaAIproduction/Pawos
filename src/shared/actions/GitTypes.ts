export type GitStatusResult = {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  clean: boolean;
};

export type GitLogEntry = {
  hash: string;
  author: string;
  date: string;
  subject: string;
};

export type GitBranchResult = {
  current: string;
  branches: string[];
};
