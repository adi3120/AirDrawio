import { describe, expect, it } from 'vitest';
import { hasMoved, hasResized, isPointInside } from './guidedTestModel';

describe('guided test verification helpers', () => {
  const base = { x: 100, y: 100, width: 180, height: 70 };

  it('recognizes a pointer inside the visible checkpoint', () => {
    const rect = { left: 10, right: 110, top: 20, bottom: 120 };
    expect(isPointInside({ x: 50, y: 60 }, rect)).toBe(true);
    expect(isPointInside({ x: 5, y: 60 }, rect)).toBe(false);
  });

  it('requires meaningful shape movement', () => {
    expect(hasMoved({ ...base, x: 165 }, base)).toBe(true);
    expect(hasMoved({ ...base, x: 120 }, base)).toBe(false);
  });

  it('accepts either width or height resize', () => {
    expect(hasResized({ ...base, width: 205 }, base)).toBe(true);
    expect(hasResized({ ...base, height: 80 }, base)).toBe(false);
  });
});
