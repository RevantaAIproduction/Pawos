import { useCallback, useEffect, useState } from 'react';
import { companionProfileStore } from './CompanionProfileStore';
import type { CompanionBehavior, CompanionPersonality, CompanionProfile, CompanionVoiceConfig } from './CompanionProfileTypes';
import type { ImportedCompanionPackage } from '../../../shared/companion/CompanionPackageTypes';

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
  const createFromUpload = useCallback(
    (input: { name: string; filePath: string; skinId?: string }) => companionProfileStore.createFromUpload(input),
    []
  );
  const markUploadRigged = useCallback((id: string, rigged: boolean) => companionProfileStore.markUploadRigged(id, rigged), []);
  const duplicate = useCallback((id: string) => companionProfileStore.duplicate(id), []);
  const exportProfile = useCallback((id: string) => companionProfileStore.export(id), []);
  const importProfile = useCallback((json: string) => companionProfileStore.import(json), []);
  const rename = useCallback((id: string, name: string) => companionProfileStore.rename(id, name), []);
  const toggleFavorite = useCallback((id: string) => companionProfileStore.toggleFavorite(id), []);
  const remove = useCallback((id: string) => companionProfileStore.delete(id), []);
  const setAvatar = useCallback((id: string, avatarImage: string | undefined) => companionProfileStore.setAvatar(id, avatarImage), []);
  const updatePersonality = useCallback(
    (id: string, patch: Partial<CompanionPersonality>) => companionProfileStore.updatePersonality(id, patch),
    []
  );
  const setMemoryEnabled = useCallback((id: string, enabled: boolean) => companionProfileStore.setMemoryEnabled(id, enabled), []);
  const resetLocalMemory = useCallback((id: string) => companionProfileStore.resetLocalMemory(id), []);
  const updateVoice = useCallback((id: string, patch: Partial<CompanionVoiceConfig>) => companionProfileStore.updateVoice(id, patch), []);
  const updateBehavior = useCallback((id: string, patch: Partial<CompanionBehavior>) => companionProfileStore.updateBehavior(id, patch), []);
  const buildPackageInput = useCallback((id: string) => companionProfileStore.buildPackageInput(id), []);
  const createFromImportedPackage = useCallback(
    (pkg: ImportedCompanionPackage) => companionProfileStore.createFromImportedPackage(pkg),
    []
  );

  return {
    profiles,
    activeId,
    active: profiles.find((p) => p.id === activeId) ?? profiles[0],
    setActive,
    create,
    createFromUpload,
    markUploadRigged,
    duplicate,
    exportProfile,
    importProfile,
    rename,
    toggleFavorite,
    remove,
    setAvatar,
    updatePersonality,
    setMemoryEnabled,
    resetLocalMemory,
    updateVoice,
    updateBehavior,
    buildPackageInput,
    createFromImportedPackage,
  };
}
