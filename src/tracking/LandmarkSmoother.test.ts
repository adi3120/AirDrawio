import { describe, expect, it } from 'vitest';
import { LandmarkSmoother } from './LandmarkSmoother';

describe('LandmarkSmoother', () => {
  it('damps slow movement and follows fast movement more closely', () => {
    const smoother = new LandmarkSmoother({
      slowAlpha: 0.2,
      fastAlpha: 0.8,
      velocityThreshold: 0.5,
    });
    expect(smoother.update({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    const slow = smoother.update({ x: 0.05, y: 0 });
    const fast = smoother.update({ x: 1, y: 0 });
    expect(slow.x).toBeLessThan(0.05);
    expect(fast.x).toBeGreaterThan(0.7);
  });

  it('clears history on reset', () => {
    const smoother = new LandmarkSmoother();
    smoother.update({ x: 0, y: 0 });
    smoother.reset();
    expect(smoother.update({ x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });
});
