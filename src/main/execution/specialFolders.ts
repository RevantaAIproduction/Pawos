import { app } from 'electron';

export type SpecialFolders = {
  documents: string;
  downloads: string;
  desktop: string;
  pictures: string;
  videos: string;
  music: string;
};

/** Electron's app.getPath already correctly resolves OneDrive-redirected Known Folders on Windows — no extra OneDrive-specific handling needed. */
export function getSpecialFolders(): SpecialFolders {
  return {
    documents: app.getPath('documents'),
    downloads: app.getPath('downloads'),
    desktop: app.getPath('desktop'),
    pictures: app.getPath('pictures'),
    videos: app.getPath('videos'),
    music: app.getPath('music'),
  };
}
