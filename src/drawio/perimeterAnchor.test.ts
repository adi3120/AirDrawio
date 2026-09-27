import { describe, expect, it } from 'vitest';
import { snapToNearestPerimeter } from './perimeterAnchor';

describe('snapToNearestPerimeter', () => {
  it('snaps near a corner to the exact corner', () => {
    expect(snapToNearestPerimeter(0.08, 0.05)).toEqual({
      x: 0,
      y: 0,
      side: 'top',
      label: 'top-left corner',
    });
  });

  it('snaps near a side midpoint to the exact center point', () => {
    expect(snapToNearestPerimeter(0.54, 0.12)).toEqual({
      x: 0.5,
      y: 0,
      side: 'top',
      label: 'top center',
    });
  });

  it('preserves an arbitrary position while projecting it onto the edge', () => {
    expect(snapToNearestPerimeter(0.72, 0.18)).toEqual({
      x: 0.72,
      y: 0,
      side: 'top',
      label: 'top edge',
    });
  });

  it('chooses the closest side and clamps positions outside the box', () => {
    expect(snapToNearestPerimeter(1.2, 0.46)).toEqual({
      x: 1,
      y: 0.5,
      side: 'right',
      label: 'right center',
    });
  });
});
