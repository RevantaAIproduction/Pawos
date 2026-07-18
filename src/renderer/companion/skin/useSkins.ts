import { useCallback, useEffect, useState } from 'react';
import { skinStore } from './SkinStore';
import type { SkinDescriptor } from './SkinTypes';

export function useSkins() {
  const [skins, setSkins] = useState<SkinDescriptor[]>(() => skinStore.list());
  const [activeId, setActiveIdState] = useState<string>(() => skinStore.getActive().id);

  useEffect(() => {
    return skinStore.subscribe(() => {
      setSkins(skinStore.list());
      setActiveIdState(skinStore.getActive().id);
    });
  }, []);

  const setActive = useCallback((id: string) => skinStore.setActive(id), []);
  const exportSkin = useCallback((id: string) => skinStore.export(id), []);
  const importSkin = useCallback((json: string) => skinStore.import(json), []);
  const remove = useCallback((id: string) => skinStore.delete(id), []);

  return {
    skins,
    activeId,
    active: skins.find((s) => s.id === activeId) ?? skins[0],
    setActive,
    exportSkin,
    importSkin,
    remove,
  };
}
