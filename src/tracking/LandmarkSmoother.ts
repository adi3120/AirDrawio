import type { NormalizedLandmark } from './handTypes';

export interface SmoothingConfig {
  slowAlpha: number;
  fastAlpha: number;
  velocityThreshold: number;
}

const DEFAULT_CONFIG: SmoothingConfig = {
  slowAlpha: 0.2,
  fastAlpha: 0.62,
  velocityThreshold: 0.065,
};

const distance = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export class LandmarkSmoother {
  private previous: NormalizedLandmark | null = null;

  constructor(private config: SmoothingConfig = DEFAULT_CONFIG) {}

  setConfig(config: Partial<SmoothingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  update(current: NormalizedLandmark): NormalizedLandmark {
    if (!this.previous) {
      this.previous = { ...current };
      return { ...current };
    }

    // Fast motion gets a higher alpha (less lag); slow motion stays damped for precision.
    const velocity = distance(current, this.previous);
    const blend = Math.min(1, velocity / this.config.velocityThreshold);
    const alpha =
      this.config.slowAlpha +
      (this.config.fastAlpha - this.config.slowAlpha) * blend;

    const smoothed = {
      x: alpha * current.x + (1 - alpha) * this.previous.x,
      y: alpha * current.y + (1 - alpha) * this.previous.y,
      z:
        current.z === undefined
          ? this.previous.z
          : alpha * current.z + (1 - alpha) * (this.previous.z ?? current.z),
    };
    this.previous = smoothed;
    return smoothed;
  }

  reset(): void {
    this.previous = null;
  }
}
