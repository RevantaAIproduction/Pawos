import React, { useEffect, useMemo, useRef } from 'react';
import type { CompanionController } from '../../companion/CompanionController';
import styles from './companionCanvas.module.css';

export function AvatarCanvas({
  controller,
  onRequestOpenSettings,
}: {
  controller: CompanionController;
  onRequestOpenSettings: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    controller.attachCanvas(canvas, wrap);

    return () => controller.detachCanvas();
  }, [controller]);

  const style = useMemo(() => ({ touchAction: 'none' as const }), []);

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      style={style}
      onDoubleClick={() => onRequestOpenSettings()}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}

