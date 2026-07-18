export type WorkspaceFileChangeEvent = {
  rootPath: string;
  changedPath: string;
  eventType: 'rename' | 'change';
};
