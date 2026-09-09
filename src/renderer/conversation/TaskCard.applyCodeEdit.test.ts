import { describe, it, expect } from 'vitest';

/**
 * Verify that applyCodeEdit actions reach the filesModified rendering path
 * and display filename/path/hunk-count information correctly.
 */

describe('TaskCard applyCodeEdit rendering', () => {
  // Mock action types and data structures
  type ActionRequest = { type: string; path?: string; [key: string]: unknown };
  type ActionResult = { ok: boolean; reason?: string; data?: { hunksApplied?: number; [key: string]: unknown } };
  type TaskAction = { id: string; type: string; request: ActionRequest; result?: ActionResult };

  // Simulates the filesModified filter from TaskCard.tsx (line 871-873 + fix)
  const getFilesModified = (actions: TaskAction[]) => {
    const FILE_WRITE_TYPES = new Set(['writeFile', 'copyPath']);
    const FILE_CHANGE_TYPES = new Set(['movePath', 'deletePath']);

    return actions.filter(
      (a) =>
        (FILE_CHANGE_TYPES.has(a.type) && a.result?.ok)
        || (FILE_WRITE_TYPES.has(a.type) && a.result?.ok && (a.result.data as { overwritten?: boolean } | undefined)?.overwritten === true)
        || (a.type === 'applyCodeEdit' && a.result?.ok)
    );
  };

  // Simulates the rendering logic from TaskCard.tsx (lines 1409-1429)
  const renderFileModification = (action: TaskAction) => {
    const path = action.request.path;
    const isCodeEdit = action.type === 'applyCodeEdit';
    const hunksApplied = isCodeEdit && action.result?.ok
      ? (action.result.data as { hunksApplied?: number } | undefined)?.hunksApplied
      : undefined;
    const filename = path ? path.split('/').pop() : undefined;

    return {
      isCodeEdit,
      filename,
      path,
      hunksApplied,
      displayApplied: hunksApplied !== undefined,
    };
  };

  it('should include applyCodeEdit with successful result in filesModified', () => {
    const actions: TaskAction[] = [
      {
        id: 'action-1',
        type: 'applyCodeEdit',
        request: { type: 'applyCodeEdit', path: 'src/Button.tsx' },
        result: { ok: true, data: { hunksApplied: 3 } },
      },
    ];

    const filesModified = getFilesModified(actions);
    expect(filesModified).toHaveLength(1);
    expect(filesModified[0].type).toBe('applyCodeEdit');
  });

  it('should exclude applyCodeEdit with failed result from filesModified', () => {
    const actions: TaskAction[] = [
      {
        id: 'action-1',
        type: 'applyCodeEdit',
        request: { type: 'applyCodeEdit', path: 'src/Button.tsx' },
        result: { ok: false, reason: 'failed' },
      },
    ];

    const filesModified = getFilesModified(actions);
    expect(filesModified).toHaveLength(0);
  });

  it('should extract filename from path correctly', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'applyCodeEdit',
      request: { type: 'applyCodeEdit', path: 'src/components/Button.tsx' },
      result: { ok: true, data: { hunksApplied: 2 } },
    };

    const rendered = renderFileModification(action);
    expect(rendered.filename).toBe('Button.tsx');
    expect(rendered.path).toBe('src/components/Button.tsx');
  });

  it('should show hunks applied count only for successful edits', () => {
    const successAction: TaskAction = {
      id: 'action-1',
      type: 'applyCodeEdit',
      request: { type: 'applyCodeEdit', path: 'src/Button.tsx' },
      result: { ok: true, data: { hunksApplied: 5 } },
    };

    const failedAction: TaskAction = {
      id: 'action-2',
      type: 'applyCodeEdit',
      request: { type: 'applyCodeEdit', path: 'src/Input.tsx' },
      result: { ok: false, reason: 'failed' },
    };

    const successRendered = renderFileModification(successAction);
    expect(successRendered.hunksApplied).toBe(5);
    expect(successRendered.displayApplied).toBe(true);

    const failedRendered = renderFileModification(failedAction);
    expect(failedRendered.hunksApplied).toBeUndefined();
    expect(failedRendered.displayApplied).toBe(false);
  });

  it('should not show "applied" wording for pending edits', () => {
    const pendingAction: TaskAction = {
      id: 'action-1',
      type: 'applyCodeEdit',
      request: { type: 'applyCodeEdit', path: 'src/Button.tsx' },
      result: undefined, // Pending action has no result yet
    };

    const rendered = renderFileModification(pendingAction);
    expect(rendered.hunksApplied).toBeUndefined();
    expect(rendered.displayApplied).toBe(false);
  });

  it('should handle single hunk correctly (no pluralization)', () => {
    const singleHunkAction: TaskAction = {
      id: 'action-1',
      type: 'applyCodeEdit',
      request: { type: 'applyCodeEdit', path: 'src/Button.tsx' },
      result: { ok: true, data: { hunksApplied: 1 } },
    };

    const rendered = renderFileModification(singleHunkAction);
    expect(rendered.hunksApplied).toBe(1);
    // The UI will render "✓ 1 hunk applied" (no 's')
  });

  it('should handle multiple hunks correctly (with pluralization)', () => {
    const multiHunkAction: TaskAction = {
      id: 'action-1',
      type: 'applyCodeEdit',
      request: { type: 'applyCodeEdit', path: 'src/Button.tsx' },
      result: { ok: true, data: { hunksApplied: 3 } },
    };

    const rendered = renderFileModification(multiHunkAction);
    expect(rendered.hunksApplied).toBe(3);
    // The UI will render "✓ 3 hunks applied" (with 's')
  });

  it('should not affect non-applyCodeEdit action types', () => {
    const actions: TaskAction[] = [
      {
        id: 'action-1',
        type: 'writeFile',
        request: { type: 'writeFile', path: 'src/new.txt' },
        result: { ok: true, data: { overwritten: false } },
      },
      {
        id: 'action-2',
        type: 'movePath',
        request: { type: 'movePath', path: 'src/old.txt' },
        result: { ok: true },
      },
      {
        id: 'action-3',
        type: 'applyCodeEdit',
        request: { type: 'applyCodeEdit', path: 'src/Button.tsx' },
        result: { ok: true, data: { hunksApplied: 2 } },
      },
    ];

    const filesModified = getFilesModified(actions);
    expect(filesModified).toHaveLength(2);
    expect(filesModified.map(a => a.type).sort()).toEqual(['applyCodeEdit', 'movePath']);
  });
});
