import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SerializedCompanion as CompanionInfo } from './CompanionLoaderTypes';
import type { SettingsState } from '../../services/settings/SettingsManager';
import type { CompanionController } from './CompanionController';
import { createCompanionController } from './CompanionController';

export function useCompanionController() {
  const [petList, setPetListState] = useState<CompanionInfo[]>([]);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [, setReadyTick] = useState(0);

  // Create the concrete CompanionController once; it manages CompanionApp lifecycle.
  const controllerRef = useRef<CompanionController | null>(null);

  const resourceBaseUrl = useMemo(() => {
    // For now, assume assets are served from a static /assets path.
    // (CompanionApp -> AnimationPlayer will resolve relative asset.src values.)
    return 'assets';
  }, []);

  useEffect(() => {
    controllerRef.current = createCompanionController({ resourceBaseUrl });
    setReadyTick((value) => value + 1);
    if (settings) controllerRef.current.applySettings(settings);

    return () => {
      try {
        controllerRef.current?.detachCanvas();
      } catch {
        // ignore
      }
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceBaseUrl]);

  const applySettings = useCallback((s: SettingsState) => {
    setSettings(s);
    controllerRef.current?.applySettings(s);
  }, []);

  const setPetList = useCallback((list: CompanionInfo[]) => {
    setPetListState(list);
  }, []);

  const controller = useMemo(
    () => ({
      petList,
      setPetList,
      controller: controllerRef.current as CompanionController,
      applySettings,
    }),
    [applySettings, petList, setPetList]
  );

  return controller;
}

export { useCompanionController as usePetController };

