import { EventEmitter } from '../../ui/events/EventEmitter';

import { SettingsManager, DEFAULT_SETTINGS, type SettingsPatch, type SettingsState } from './SettingsManager';

class Singleton {
  manager = new SettingsManager();
  emitter = new EventEmitter<SettingsState>();
}

const singleton = new Singleton();

export function getSettingsState(): SettingsState {
  return singleton.manager.getState();
}

export function updateSettings(patch: SettingsPatch) {
  singleton.manager.update(patch);
  singleton.emitter.emit(singleton.manager.getState());
}

export function onSettingsChanged(cb: (s: SettingsState) => void) {
  return singleton.emitter.on(cb);
}

export function getDefaultSettings(): SettingsState {
  return DEFAULT_SETTINGS;
}

