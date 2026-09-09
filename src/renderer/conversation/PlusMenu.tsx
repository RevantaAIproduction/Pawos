import React, { useRef, useState } from 'react';
import styles from './plusMenu.module.css';

interface PlusMenuProps {
  onAddFiles?: () => void;
  onAddPhotos?: () => void;
  onAddFolder?: () => void;
  onAddConnector?: () => void;
  onAddSlashCommand?: () => void;
}

export function PlusMenu({
  onAddFiles,
  onAddPhotos,
  onAddFolder,
  onAddConnector,
  onAddSlashCommand,
}: PlusMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoClick = () => {
    photoInputRef.current?.click();
  };

  return (
    <div className={styles.container} data-interactive="true">
      <button
        className={styles.button}
        onClick={() => setMenuOpen(!menuOpen)}
        title="Add files, photos, folder, or connectors"
      >
        +
      </button>
      {menuOpen && (
        <div className={styles.menu}>
          <button className={styles.menuItem} onClick={handleFileClick}>
            📎 Add files
          </button>
          <button className={styles.menuItem} onClick={handlePhotoClick}>
            🖼️ Add photos
          </button>
          <button className={styles.menuItem} onClick={onAddFolder}>
            📁 Add folder
          </button>
          <div className={styles.divider} />
          <button className={styles.menuItem} onClick={onAddSlashCommand}>
            / Slash commands
          </button>
          <button className={styles.menuItem} onClick={onAddConnector}>
            🔗 Connectors
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          onAddFiles?.();
          setMenuOpen(false);
        }}
      />
      <input
        ref={photoInputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          onAddPhotos?.();
          setMenuOpen(false);
        }}
      />
    </div>
  );
}
