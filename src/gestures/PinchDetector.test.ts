import { describe, expect, it } from 'vitest';
import {
  PinchDetector,
  calculatePinchMeasurement,
  calculatePinchRatio,
} from './PinchDetector';
import type { NormalizedLandmark } from '../tracking/handTypes';

function landmarksWithTipDistance(distance: number): NormalizedLandmark[] {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })) as NormalizedLandmark[];
  landmarks[0] = { x: 0.5, y: 1, z: 0 };
  landmarks[4] = { x: 0, y: 0, z: 0 };
  landmarks[8] = { x: distance, y: 0, z: 0 };
  landmarks[5] = { x: 0, y: 1, z: 0 };
  landmarks[9] = { x: 0.5, y: 0, z: 0 };
  landmarks[17] = { x: 1, y: 1, z: 0 };
  return landmarks;
}

describe('PinchDetector', () => {
  it('requires a stable pinch and uses hysteresis before release', () => {
    const detector = new PinchDetector({
      startThreshold: 0.25,
      releaseThreshold: 0.35,
      minimumDurationMs: 50,
      cooldownMs: 80,
    });

    expect(detector.update(0.2, 0)).toBe('candidate');
    expect(detector.update(0.2, 30)).toBe('candidate');
    expect(detector.update(0.2, 55)).toBe('started');
    expect(detector.update(0.3, 70)).toBe('held');
    expect(detector.update(0.36, 90)).toBe('ended');
    expect(detector.update(0.2, 130)).toBe('open');
  });

  it('normalizes thumb-index distance by palm width', () => {
    const landmarks = landmarksWithTipDistance(0.2);
    expect(calculatePinchRatio(landmarks)).toBeCloseTo(0.2);
  });

  it('prefers orientation-independent 3D world landmarks for a side-on pinch', () => {
    const image = landmarksWithTipDistance(0.43);
    const world = landmarksWithTipDistance(0.18);
    const measurement = calculatePinchMeasurement(image, world);

    expect(measurement.imageRatio).toBeCloseTo(0.43);
    expect(measurement.worldRatio).toBeCloseTo(0.18);
    expect(measurement.ratio).toBeCloseTo(0.18);
    expect(measurement.source).toBe('world');
  });

  it('uses 3D separation to avoid a false pinch when fingertips only overlap on screen', () => {
    const image = landmarksWithTipDistance(0.05);
    const world = landmarksWithTipDistance(0.72);
    const measurement = calculatePinchMeasurement(image, world);

    expect(measurement.imageRatio).toBeCloseTo(0.05);
    expect(measurement.ratio).toBeCloseTo(0.72);
  });

  it('keeps the 2D fallback stable when projected palm width collapses', () => {
    const image = landmarksWithTipDistance(0.4);
    image[5] = { x: 0.45, y: 1 };
    image[17] = { x: 0.55, y: 1 };

    expect(calculatePinchMeasurement(image).ratio).toBeCloseTo(0.4);
  });
});
