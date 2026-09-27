import { describe, expect, it } from 'vitest';
import type { NormalizedLandmark } from '../tracking/handTypes';
import { ZoomGestureDetector, type ZoomGestureConfig } from './ZoomGestureDetector';

const TEST_CONFIG: ZoomGestureConfig = {
  depthThreshold: 0.01,
  apertureThreshold: 0.02,
  smoothingAlpha: 1,
  minimumIntervalMs: 40,
  gain: 1,
  maximumStep: 0.12,
  resetDwellMs: 100,
};

function hand(depth: number, aperture: number): NormalizedLandmark[] {
  const landmarks = Array.from(
    { length: 21 },
    () => ({ x: 0.5, y: 0.5, z: 0 }),
  ) as NormalizedLandmark[];
  landmarks[0] = { x: 0.5, y: 0.5 + depth / 2 };
  landmarks[5] = { x: 0.5 - depth / 2, y: 0.5 };
  landmarks[9] = { x: 0.5, y: 0.5 - depth / 2 };
  landmarks[17] = { x: 0.5 + depth / 2, y: 0.5 };
  landmarks[4] = { x: 0.5 - aperture * depth / 2, y: 0.35 };
  landmarks[8] = { x: 0.5 + aperture * depth / 2, y: 0.35 };
  return landmarks;
}

describe('ZoomGestureDetector', () => {
  it('zooms in when the hand approaches while thumb and index open', () => {
    const detector = new ZoomGestureDetector(TEST_CONFIG);
    expect(detector.update(hand(0.18, 0.3), 0)).toBeNull();

    const reading = detector.update(hand(0.2, 0.42), 60);
    expect(reading?.direction).toBe('in');
    expect(reading?.factor).toBeGreaterThan(1);
  });

  it('zooms out when the hand recedes while thumb and index close', () => {
    const detector = new ZoomGestureDetector(TEST_CONFIG);
    detector.update(hand(0.2, 0.48), 0);

    const reading = detector.update(hand(0.175, 0.31), 60);
    expect(reading?.direction).toBe('out');
    expect(reading?.factor).toBeLessThan(1);
  });

  it('ignores motion when depth and finger movement do not agree', () => {
    const detector = new ZoomGestureDetector(TEST_CONFIG);
    detector.update(hand(0.18, 0.3), 0);

    expect(detector.update(hand(0.21, 0.24), 60)).toBeNull();
  });

  it('does not repeatedly zoom while the hand is held still', () => {
    const detector = new ZoomGestureDetector(TEST_CONFIG);
    detector.update(hand(0.18, 0.3), 0);
    expect(detector.update(hand(0.2, 0.42), 60)).not.toBeNull();
    expect(detector.update(hand(0.2, 0.42), 120)).toBeNull();
  });

  it('requires a fresh baseline after reset', () => {
    const detector = new ZoomGestureDetector(TEST_CONFIG);
    detector.update(hand(0.18, 0.3), 0);
    detector.reset();
    expect(detector.update(hand(0.22, 0.5), 60)).toBeNull();
  });

  it('treats the reverse motion as a clutch instead of undoing the zoom', () => {
    const detector = new ZoomGestureDetector(TEST_CONFIG);
    detector.update(hand(0.18, 0.3), 0);
    expect(detector.update(hand(0.2, 0.42), 60)?.direction).toBe('in');

    expect(detector.update(hand(0.18, 0.3), 120)).toBeNull();
    expect(detector.getPhase()).toBe('resetting');
    expect(detector.update(hand(0.18, 0.3), 180)).toBeNull();
    expect(detector.update(hand(0.18, 0.3), 290)).toBeNull();
    expect(detector.getPhase()).toBe('ready');

    expect(detector.update(hand(0.2, 0.42), 350)?.direction).toBe('in');
  });

  it('uses the same clutch behavior after a zoom-out stroke', () => {
    const detector = new ZoomGestureDetector(TEST_CONFIG);
    detector.update(hand(0.2, 0.48), 0);
    expect(detector.update(hand(0.175, 0.31), 60)?.direction).toBe('out');

    expect(detector.update(hand(0.2, 0.48), 120)).toBeNull();
    expect(detector.getPhase()).toBe('resetting');
  });
});
