import React, { useState } from 'react';
import styles from './workTreeCard.module.css';
import type { CardConfig } from '../Card';

interface FileItem {
  id: string;
  path: string;
  status: 'modified' | 'new' | 'deleted' | 'staged';
  size?: string;
}

interface WorkTreeCardProps {
  card: CardConfig;
  onRemoveCard: (cardId: string) => void;
}

export function WorkTreeCard({ card, onRemoveCard }: WorkTreeCardProps) {
  const [files, setFiles] = useState<FileItem[]>([
    { id: '1', path: 'src/main.ts', status: 'modified', size: '2.5 KB' },
    { id: '2', path: 'src/index.tsx', status: 'modified', size: '1.2 KB' },
    { id: '3', path: 'package.json', status: 'modified', size: '800 B' },
    { id: '4', path: 'tsconfig.json', status: 'new', size: '400 B' },
  ]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const selectedFile = selectedFileId ? files.find((f) => f.id === selectedFileId) : null;

  const getStatusColor = (status: FileItem['status']) => {
    switch (status) {
      case 'modified':
        return styles.statusModified;
      case 'new':
        return styles.statusNew;
      case 'deleted':
        return styles.statusDeleted;
      case 'staged':
        return styles.statusStaged;
      default:
        return '';
    }
  };

  const getStatusIcon = (status: FileItem['status']) => {
    switch (status) {
      case 'modified':
        return '●';
      case 'new':
        return '+';
      case 'deleted':
        return '−';
      case 'staged':
        return '✓';
      default:
        return '○';
    }
  };

  return (
    <div className={styles.workTreeCard}>
      <div className={styles.fileList}>
        {files.length === 0 ? (
          <div className={styles.empty}>No files in work tree</div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className={`${styles.fileItem} ${selectedFileId === file.id ? styles.selected : ''}`}
              onClick={() => setSelectedFileId(file.id)}
            >
              <span className={`${styles.statusIcon} ${getStatusColor(file.status)}`}>
                {getStatusIcon(file.status)}
              </span>
              <span className={styles.filePath}>{file.path}</span>
              {file.size && <span className={styles.fileSize}>{file.size}</span>}
            </div>
          ))
        )}
      </div>

      {selectedFile && (
        <div className={styles.fileDetails}>
          <div className={styles.detailsHeader}>{selectedFile.path}</div>
          <div className={styles.detailsContent}>
            <div className={styles.detailRow}>
              <span className={styles.label}>Status:</span>
              <span className={`${styles.value} ${getStatusColor(selectedFile.status)}`}>
                {selectedFile.status}
              </span>
            </div>
            {selectedFile.size && (
              <div className={styles.detailRow}>
                <span className={styles.label}>Size:</span>
                <span className={styles.value}>{selectedFile.size}</span>
              </div>
            )}
            <div className={styles.actionButtons}>
              <button className={styles.actionButton}>View Diff</button>
              <button className={styles.actionButton}>Stage</button>
              <button className={styles.actionButton}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
