import React from 'react';
import styles from './dashboard.module.css';

/**
 * The one on/off switch every Settings toggle row uses — replaces plain
 * `<input type="checkbox">` everywhere in Preferences/Notifications with a
 * green-when-on, gray-when-off sliding switch. Purely presentational; the
 * caller still owns the actual boolean state and persistence.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  size = 'md',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name when this toggle isn't already wrapped in a labelled row. */
  label?: string;
  /** 'sm' fits dense contexts — permission tables, recipient lists — where a full-size switch would blow out the layout. */
  size?: 'md' | 'sm';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-checked={checked}
      className={size === 'sm' ? styles.toggleSwitchSm : styles.toggleSwitch}
      onClick={() => onChange(!checked)}
    >
      <span className={size === 'sm' ? styles.toggleThumbSm : styles.toggleThumb} />
    </button>
  );
}
