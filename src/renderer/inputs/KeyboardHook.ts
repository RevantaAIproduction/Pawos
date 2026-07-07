export type KeyboardHookHandler = (evt: {
  key: string;
  code?: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  type: 'down' | 'up';
  repeat?: boolean;
}) => void;

export class KeyboardHook {
  private onKeyDown = (e: KeyboardEvent) => {
    this.handler({
      type: 'down',
      key: e.key,
      code: e.code,
      meta: e.metaKey,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      repeat: e.repeat,
    });
  };

  constructor(private handler: KeyboardHookHandler) {}

  start() {
    window.addEventListener('keydown', this.onKeyDown, { passive: true });
  }

  stop() {
    window.removeEventListener('keydown', this.onKeyDown);
  }
}

