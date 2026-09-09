import { useState, useCallback, useRef } from 'react';
import { useIpcBridge } from '../services/ipc/useIpcBridge';

/**
 * PRAGMATIC hands-on coding: Track current file selection within a conversation.
 * This integrates with useConversationController to inject file context into reasoning.
 *
 * MINIMAL viable implementation:
 * - User selects a file path
 * - File content is read
 * - Content injected into system prompt
 * - Model gets file context for targeted edits
 *
 * NO orphaned components. NO separate workflow. Just context injection.
 */

export interface CurrentFile {
  path: string;
  language?: string;
  content?: string;
  lastRead?: number;
}

export interface FileContextApi {
  currentFile: CurrentFile | null;
  isLoading: boolean;
  error: string | null;

  // Simple file selection
  selectFile: (path: string) => Promise<void>;
  clearFile: () => void;

  // Reload if external changes
  reloadFile: () => Promise<void>;
}

/**
 * Minimal hook for hands-on coding file context.
 * Integrates with existing ConversationRuntime via injected system prompt.
 */
export function useCurrentFileContext(): FileContextApi {
  const ipc = useIpcBridge();
  const [currentFile, setCurrentFile] = useState<CurrentFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectFile = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Read file via existing IPC
      const result = await ipc.executeAction({
        type: 'readFile',
        path,
        maxChars: 50000,
      });

      if (!result.ok) {
        setError(`Failed to read file: ${(result as { reason?: string }).reason || 'Unknown error'}`);
        return;
      }

      const content = typeof result.data === 'string' ? result.data : '';
      const language = detectLanguage(path);

      setCurrentFile({
        path,
        language,
        content,
        lastRead: Date.now(),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [ipc]);

  const reloadFile = useCallback(async () => {
    if (!currentFile?.path) return;
    await selectFile(currentFile.path);
  }, [currentFile?.path, selectFile]);

  const clearFile = useCallback(() => {
    setCurrentFile(null);
    setError(null);
  }, []);

  return {
    currentFile,
    isLoading,
    error,
    selectFile,
    reloadFile,
    clearFile,
  };
}

/**
 * Build system prompt addendum for hands-on file editing.
 * Called by useConversationController when file is selected.
 */
export function buildFileContextPrompt(file: CurrentFile | null): string {
  if (!file?.content) return '';

  return `
[Current Working File: ${file.path}]
${file.language ? `Language: ${file.language}` : ''}

\`\`\`${file.language || ''}
${file.content}
\`\`\`
[End File Context]

When making changes to this file, use propose_code_edit_plan with specific hunks targeting the exact lines shown above.
`;
}

/**
 * Detect language from file extension.
 * PRAGMATIC: Just enough for syntax highlighting hints.
 */
function detectLanguage(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
  };
  return ext ? map[ext] : undefined;
}
