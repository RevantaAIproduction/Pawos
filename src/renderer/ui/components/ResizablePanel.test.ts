import { describe, expect, it } from 'vitest';
import { clampWidth } from './ResizablePanel';

describe('resizable right-side panels', () => {
  it('keeps the width between the panel minimum and maximum', () => {
    expect(clampWidth(100, 280, 700)).toBe(280);
    expect(clampWidth(900, 280, 700)).toBe(700);
    expect(clampWidth(412.6, 280, 700)).toBe(413);
  });
  it('a window too narrow for the maximum still gets the minimum', () => {
    expect(clampWidth(500, 280, 200)).toBe(280);
  });
});
