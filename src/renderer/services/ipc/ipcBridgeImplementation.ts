import type { SettingsState } from './ipcTypes';
import { contextBridge } from './windowBridge';

export const ipc = contextBridge();

export type IpcApi = typeof ipc;

export type IpcSettings = SettingsState;

