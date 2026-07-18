import { useCallback, useEffect, useState } from 'react';
import { companionProfileStore } from './CompanionProfileStore';
import type { CompanionPhoto, CompanionProfile } from './CompanionProfileTypes';

export function useCompanionProfiles() {
  const [profiles, setProfiles] = useState<CompanionProfile[]>(() => companionProfileStore.list());
  const [activeId, setActiveId] = useState<string>(() => companionProfileStore.getActive().id);

  useEffect(() => {
    return companionProfileStore.subscribe(() => {
      setProfiles(companionProfileStore.list());
      setActiveId(companionProfileStore.getActive().id);
    });
  }, []);

  const setActive = useCallback((id: string) => companionProfileStore.setActive(id), []);
  const create = useCallback(
    (input: { name: string; skinId?: string; avatarImage?: string }) => companionProfileStore.create(input),
    []
  );
  const createFromLab = useCallback(
    (input: { name: string; mode: 'quick' | 'studio'; photos: CompanionPhoto[]; skinId?: string }) =>
      companionProfileStore.createFromLab(input),
    []
  );
  const duplicate = useCallback((id: string) => companionProfileStore.duplicate(id), []);
  const exportProfile = useCallback((id: string) => companionProfileStore.export(id), []);
  const importProfile = useCallback((json: string) => companionProfileStore.import(json), []);
  const rename = useCallback((id: string, name: string) => companionProfileStore.rename(id, name), []);
  const toggleFavorite = useCallback((id: string) => companionProfileStore.toggleFavorite(id), []);
  const remove = useCallback((id: string) => companionProfileStore.delete(id), []);
  const setAvatar = useCallback((id: string, avatarImage: string | undefined) => companionProfileStore.setAvatar(id, avatarImage), []);

  return {
    profiles,
    activeId,
    active: profiles.find((p) => p.id === activeId) ?? profiles[0],
    setActive,
    create,
    createFromLab,
    duplicate,
    exportProfile,
    importProfile,
    rename,
    toggleFavorite,
    remove,
    setAvatar,
  };
}
