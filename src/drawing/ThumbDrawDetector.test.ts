import { describe, expect, it } from 'vitest';
import type { NormalizedLandmark } from '../tracking/handTypes';
import { ThumbDrawDetector } from './ThumbDrawDetector';

function hand(thumbX: number, thumbY: number): NormalizedLandmark[] {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  landmarks[4] = { x: thumbX, y: thumbY, z: 0 };
  landmarks[5] = { x: 0.3, y: 0.45, z: 0 };
  landmarks[9] = { x: 0.43, y: 0.4, z: 0 };
  landmarks[13] = { x: 0.57, y: 0.4, z: 0 };
  landmarks[17] = { x: 0.7, y: 0.45, z: 0 };
  return landmarks;
}

describe('ThumbDrawDetector', () => {
  it('requires an open pose before it accepts a deliberate thumb close', () => {
    const detector = new ThumbDrawDetector();
    expect(detector.update(hand(0.49, 0.42), undefined, 0)?.transition).toBeNull();
    detector.update(hand(0.05, 0.4), undefined, 20);
    detector.update(hand(0.05, 0.4), undefined, 150);
    detector.update(hand(0.49, 0.42), undefined, 200);
    expect(detector.update(hand(0.49, 0.42), undefined, 330)?.transition).toBe('closed');
  });

  it('opens only after hysteresis and dwell', () => {
    const detector = new ThumbDrawDetector();
    detector.update(hand(0.05, 0.4), undefined, 0);
    detector.update(hand(0.49, 0.42), undefined, 20);
    detector.update(hand(0.49, 0.42), undefined, 150);
    detector.update(hand(0.05, 0.4), undefined, 180);
    expect(detector.update(hand(0.05, 0.4), undefined, 310)?.transition).toBe('opened');
  });

  it('learns a comfortable open pose that is below the absolute open threshold', () => {
    const detector = new ThumbDrawDetector();
    detector.update(hand(0.2, 0.42), undefined, 0);
    detector.update(hand(0.2, 0.42), undefined, 180);
    detector.update(hand(0.42, 0.42), undefined, 220);
    expect(detector.update(hand(0.42, 0.42), undefined, 310)?.transition).toBe('closed');
  });

  it('keeps a deliberate close through a brief neutral landmark frame', () => {
    const detector = new ThumbDrawDetector();
    detector.update(hand(0.05, 0.4), undefined, 0);
    detector.update(hand(0.49, 0.42), undefined, 20);
    detector.update(hand(0.3, 0.42), undefined, 55);
    expect(detector.update(hand(0.49, 0.42), undefined, 105)?.transition).toBe('closed');
  });

  it('does not complete a gesture using stale evidence after a long frame gap', () => {
    const detector = new ThumbDrawDetector();
    detector.update(hand(0.05, 0.4), undefined, 0);
    detector.update(hand(0.49, 0.42), undefined, 20);
    expect(detector.update(hand(0.49, 0.42), undefined, 300)?.transition).toBeNull();
    expect(detector.update(hand(0.49, 0.42), undefined, 390)?.transition).toBe('closed');
  });
});
