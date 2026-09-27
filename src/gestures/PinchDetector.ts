import type { NormalizedLandmark } from '../tracking/handTypes';
import type { PinchPhase } from './gestureTypes';

export interface PinchConfig {
  startThreshold: number;
  releaseThreshold: number;
  minimumDurationMs: number;
  cooldownMs: number;
}

export const DEFAULT_PINCH_CONFIG: PinchConfig = {
  startThreshold: 0.46,
  releaseThreshold: 0.62,
  minimumDurationMs: 55,
  cooldownMs: 90,
};

export interface PinchMeasurement {
  ratio: number;
  imageRatio: number;
  worldRatio: number | null;
  source: 'world' | 'image';
}

const distance2d = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const distance3d = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

function ratioFor(
  landmarks: NormalizedLandmark[],
  distance: (a: NormalizedLandmark, b: NormalizedLandmark) => number,
): number {
  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];
  if (!wrist || !thumbTip || !indexTip || !indexMcp || !middleMcp || !pinkyMcp) {
    return Number.POSITIVE_INFINITY;
  }

  // A single projected palm-width collapses when the hand turns sideways. The
  // longest of several palm spans remains stable across yaw and camera depth.
  const palmScale = Math.max(
    distance(indexMcp, pinkyMcp),
    distance(wrist, middleMcp),
    distance(wrist, indexMcp),
    distance(wrist, pinkyMcp),
    0.0001,
  );
  return distance(thumbTip, indexTip) / palmScale;
}

export function calculatePinchMeasurement(
  landmarks: NormalizedLandmark[],
  worldLandmarks?: NormalizedLandmark[],
): PinchMeasurement {
  const imageRatio = ratioFor(landmarks, distance2d);
  const rawWorldRatio = worldLandmarks ? ratioFor(worldLandmarks, distance3d) : null;
  const worldRatio = rawWorldRatio !== null && Number.isFinite(rawWorldRatio)
    ? rawWorldRatio
    : null;

  return worldRatio === null
    ? { ratio: imageRatio, imageRatio, worldRatio, source: 'image' }
    : { ratio: worldRatio, imageRatio, worldRatio, source: 'world' };
}

export function calculatePinchRatio(
  landmarks: NormalizedLandmark[],
  worldLandmarks?: NormalizedLandmark[],
): number {
  return calculatePinchMeasurement(landmarks, worldLandmarks).ratio;
}

export class PinchDetector {
  private active = false;
  private candidateSince: number | null = null;
  private cooldownUntil = 0;

  constructor(private config: PinchConfig = DEFAULT_PINCH_CONFIG) {}

  setConfig(config: Partial<PinchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  update(ratio: number, timestamp: number): PinchPhase {
    if (this.active) {
      if (ratio > this.config.releaseThreshold) {
        this.active = false;
        this.candidateSince = null;
        this.cooldownUntil = timestamp + this.config.cooldownMs;
        return 'ended';
      }
      return 'held';
    }

    if (timestamp < this.cooldownUntil) return 'open';
    if (ratio >= this.config.startThreshold) {
      this.candidateSince = null;
      return 'open';
    }

    if (this.candidateSince === null) {
      this.candidateSince = timestamp;
      return 'candidate';
    }

    if (timestamp - this.candidateSince >= this.config.minimumDurationMs) {
      this.active = true;
      this.candidateSince = null;
      return 'started';
    }

    return 'candidate';
  }

  forceRelease(timestamp: number): boolean {
    const wasActive = this.active;
    this.active = false;
    this.candidateSince = null;
    this.cooldownUntil = timestamp + this.config.cooldownMs;
    return wasActive;
  }

  isActive(): boolean {
    return this.active;
  }
}
