import type { NormalizedLandmark } from '../tracking/handTypes';

export interface ZoomGestureConfig {
  depthThreshold: number;
  apertureThreshold: number;
  smoothingAlpha: number;
  minimumIntervalMs: number;
  gain: number;
  maximumStep: number;
  resetDwellMs: number;
}

export interface ZoomGestureReading {
  direction: 'in' | 'out';
  factor: number;
  depthChange: number;
  apertureChange: number;
}

export type ZoomGesturePhase = 'ready' | 'zooming-in' | 'zooming-out' | 'resetting';

const DEFAULT_CONFIG: ZoomGestureConfig = {
  depthThreshold: 0.025,
  apertureThreshold: 0.055,
  smoothingAlpha: 0.42,
  minimumIntervalMs: 48,
  gain: 0.9,
  maximumStep: 0.1,
  resetDwellMs: 180,
};

const distance = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

interface HandMetrics {
  depth: number;
  aperture: number;
}

/**
 * Detects an intentionally two-part zoom gesture. Apparent palm size acts as
 * the toward/away signal, while thumb-index separation supplies the
 * open/close signal. Requiring both signals to agree prevents ordinary hand
 * motion from changing the canvas scale.
 */
export class ZoomGestureDetector {
  private smoothed: HandMetrics | null = null;
  private reference: HandMetrics | null = null;
  private lastEmission = -Infinity;
  private activeDirection: 'in' | 'out' | null = null;
  private returning = false;
  private settleStartedAt: number | null = null;

  constructor(private readonly config: ZoomGestureConfig = DEFAULT_CONFIG) {}

  update(landmarks: NormalizedLandmark[], timestamp: number): ZoomGestureReading | null {
    const measured = this.measure(landmarks);
    if (!measured) {
      this.reset();
      return null;
    }

    const previous = this.smoothed;
    const current = previous
      ? {
          depth: this.lerp(previous.depth, measured.depth, this.config.smoothingAlpha),
          aperture: this.lerp(previous.aperture, measured.aperture, this.config.smoothingAlpha),
        }
      : measured;
    this.smoothed = current;

    if (!this.reference) {
      this.reference = { ...current };
      return null;
    }


    if (this.returning) {
      const depthVelocity = previous
        ? Math.abs((current.depth - previous.depth) / Math.max(previous.depth, 0.025))
        : Infinity;
      const apertureVelocity = previous
        ? Math.abs((current.aperture - previous.aperture) / Math.max(previous.aperture, 0.18))
        : Infinity;
      const settled =
        depthVelocity < this.config.depthThreshold * 0.45 &&
        apertureVelocity < this.config.apertureThreshold * 0.45;

      if (settled) {
        this.settleStartedAt ??= timestamp;
        if (timestamp - this.settleStartedAt >= this.config.resetDwellMs) {
          this.activeDirection = null;
          this.returning = false;
          this.settleStartedAt = null;
          this.reference = { ...current };
        }
      } else {
        this.settleStartedAt = null;
      }
      // The entire return motion is a clutch/re-arm action. It can never
      // reverse the zoom that the preceding deliberate stroke produced.
      this.reference = { ...current };
      return null;
    }

    const depthChange = (current.depth - this.reference.depth) / this.reference.depth;
    const apertureChange =
      (current.aperture - this.reference.aperture) / Math.max(this.reference.aperture, 0.18);
    const zoomingIn =
      depthChange >= this.config.depthThreshold &&
      apertureChange >= this.config.apertureThreshold;
    const zoomingOut =
      depthChange <= -this.config.depthThreshold &&
      apertureChange <= -this.config.apertureThreshold;

    const detectedDirection = zoomingIn ? 'in' : zoomingOut ? 'out' : null;
    if (
      this.activeDirection &&
      detectedDirection &&
      detectedDirection !== this.activeDirection
    ) {
      this.returning = true;
      this.settleStartedAt = null;
      this.reference = { ...current };
      return null;
    }

    if (!zoomingIn && !zoomingOut) {
      // Follow incoherent or stationary motion slowly. This avoids a stale
      // baseline suddenly firing after the hand has changed pose in stages.
      this.reference = {
        depth: this.lerp(this.reference.depth, current.depth, 0.08),
        aperture: this.lerp(this.reference.aperture, current.aperture, 0.08),
      };
      return null;
    }

    if (timestamp - this.lastEmission < this.config.minimumIntervalMs) return null;

    const direction = detectedDirection!;
    this.activeDirection ??= direction;
    const depthMotion = Math.max(0, Math.abs(depthChange) - this.config.depthThreshold);
    const apertureMotion = Math.max(0, Math.abs(apertureChange) - this.config.apertureThreshold);
    const magnitude = Math.min(
      this.config.maximumStep,
      Math.max(0.012, (apertureMotion * 0.7 + depthMotion * 0.3) * this.config.gain),
    );
    const factor = Math.exp(direction === 'in' ? magnitude : -magnitude);

    this.reference = { ...current };
    this.lastEmission = timestamp;
    return { direction, factor, depthChange, apertureChange };
  }

  reset(): void {
    this.smoothed = null;
    this.reference = null;
    this.lastEmission = -Infinity;
    this.activeDirection = null;
    this.returning = false;
    this.settleStartedAt = null;
  }

  getPhase(): ZoomGesturePhase {
    if (this.returning) return 'resetting';
    if (this.activeDirection === 'in') return 'zooming-in';
    if (this.activeDirection === 'out') return 'zooming-out';
    return 'ready';
  }

  private measure(landmarks: NormalizedLandmark[]): HandMetrics | null {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexMcp = landmarks[5];
    const indexTip = landmarks[8];
    const middleMcp = landmarks[9];
    const pinkyMcp = landmarks[17];
    if (!wrist || !thumbTip || !indexMcp || !indexTip || !middleMcp || !pinkyMcp) return null;

    // Averaging palm width and length is less sensitive to in-plane rotation
    // than a bounding box, while still increasing as the hand approaches.
    const depth = (distance(indexMcp, pinkyMcp) + distance(wrist, middleMcp)) / 2;
    if (!Number.isFinite(depth) || depth < 0.025) return null;

    return {
      depth,
      // Normalization removes the apparent-size change from the open/close
      // measurement, leaving actual thumb-index articulation.
      aperture: distance(thumbTip, indexTip) / depth,
    };
  }

  private lerp(from: number, to: number, amount: number): number {
    return from + (to - from) * amount;
  }
}
