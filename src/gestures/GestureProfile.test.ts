import { describe, expect, it } from 'vitest';
import { createGestureProfile, learnPinchThreshold } from './GestureProfile';

describe('GestureProfile', () => {
  it('learns a boundary above a user\'s ten comfortable pinch samples', () => {
    const samples = [0.36, 0.38, 0.39, 0.4, 0.4, 0.41, 0.41, 0.42, 0.43, 0.58];
    const threshold = learnPinchThreshold(samples);

    expect(threshold).toBeGreaterThan(0.43);
    expect(threshold).toBeLessThan(0.58);
  });

  it('stores the measurement source and learned threshold', () => {
    const samples = [0.18, 0.19, 0.2, 0.2, 0.21, 0.21, 0.22, 0.22, 0.23, 0.24];
    const profile = createGestureProfile(samples, 'world');

    expect(profile.version).toBe(1);
    expect(profile.pinch.samples).toEqual(samples);
    expect(profile.pinch.source).toBe('world');
    expect(profile.pinch.threshold).toBeGreaterThan(0.24);
  });
});
