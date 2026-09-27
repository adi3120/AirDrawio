import { describe, expect, it } from 'vitest';
import { getInfiniteGridCss } from './infiniteCanvas';

describe('infinite canvas grid', () => {
  it('scales the grid and wraps negative translations seamlessly', () => {
    const grid = getInfiniteGridCss(16, 2, -3, 4);
    expect(grid.gridSize).toBe('32px');
    expect(grid.gridX).toBe('25px');
    expect(grid.gridY).toBe('7px');
    expect(grid.rulerSize).toBe('160px');
  });

  it('includes live pan preview movement', () => {
    const base = getInfiniteGridCss(16, 1, 0, 0);
    const moved = getInfiniteGridCss(16, 1, 0, 0, 10, 6);
    expect(moved.gridX).not.toBe(base.gridX);
    expect(moved.gridY).not.toBe(base.gridY);
  });
});
