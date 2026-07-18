import * as React from 'react';
import { Img } from '@react-email/components';

/**
 * The real PawOS logo, cropped directly from the official artwork — never
 * redrawn or reinterpreted. `src` is injected by the caller (EmailService
 * uses cid: attachments when actually sending; the mail preview page uses
 * data: URIs so it renders in a plain browser).
 */
export function Logo({ variant, src }: { variant: 'full' | 'icon'; src: string }) {
  return variant === 'full' ? (
    <Img src={src} width="140" height="148" alt="PawOS" style={{ display: 'block', margin: '0 auto' }} />
  ) : (
    <Img src={src} width="36" height="36" alt="PawOS" style={{ display: 'block' }} />
  );
}
