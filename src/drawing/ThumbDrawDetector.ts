import type { NormalizedLandmark } from '../tracking/handTypes';

export type ThumbPose = 'open' | 'closed' | 'transition';

export interface ThumbDrawReading {
  pose: ThumbPose;
  transition: 'closed' | 'opened' | null;
  ratio: number;
}

interface ThumbDrawDetectorConfig {
  closeThreshold: number;
  openThreshold: number;
  relativeClose: number;
  relativeOpen: number;
  minimumCloseDrop: number;
  dwellMs: number;
  candidateGraceMs: number;
  calibrationMs: number;
}

const DEFAULT_CONFIG: ThumbDrawDetectorConfig = {
  // Absolute fallbacks still work when the initial open pose was especially
  // wide, while the relative thresholds adapt to each user's comfortable pose.
  closeThreshold: 0.68,
  openThreshold: 0.82,
  relativeClose: 0.8,
  relativeOpen: 0.9,
  minimumCloseDrop: 0.065,
  dwellMs: 75,
  candidateGraceMs: 150,
  calibrationMs: 160,
};

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function average(points: NormalizedLandmark[]): NormalizedLandmark {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + (point.z ?? 0), 0) / points.length,
  };
}

function thumbPalmRatio(landmarks: NormalizedLandmark[]): number | null {
  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  const pinkyMcp = landmarks[17];
  if (!thumbTip || !indexMcp || !middleMcp || !ringMcp || !pinkyMcp) return null;

  const palmWidth = distance(indexMcp, pinkyMcp);
  if (palmWidth < 0.0001) return null;
  const palmCenter = average([indexMcp, middleMcp, ringMcp, pinkyMcp]);
  return distance(thumbTip, palmCenter) / palmWidth;
}

/**
 * Detects a thumb tucked into the palm independently of which way the hand is
 * facing. World landmarks are preferred so a side-on hand works as well as a
 * palm facing the camera.
 *
 * The first comfortable pose after Air Pen is armed becomes a personal open
 * baseline. Closing is then a relative movement instead of one hard-coded
 * anatomical pose. Hysteresis, dwell, and a short neutral-frame grace keep
 * landmark noise from dropping a real stroke.
 */
export class ThumbDrawDetector {
  private pose: 'open' | 'closed' = 'open';
  private candidate: 'open' | 'closed' | null = null;
  private candidateSince = 0;
  private candidateLastSeenAt = 0;
  private hasSeenOpen = false;
  private calibrationStartedAt: number | null = null;
  private openBaseline: number | null = null;
  private smoothedRatio: number | null = null;

  constructor(private readonly config: ThumbDrawDetectorConfig = DEFAULT_CONFIG) {}

  update(
    imageLandmarks: NormalizedLandmark[],
    worldLandmarks: NormalizedLandmark[] | undefined,
    timestamp: number,
  ): ThumbDrawReading | null {
    const worldRatio = worldLandmarks?.length === imageLandmarks.length
      ? thumbPalmRatio(worldLandmarks)
      : null;
    const imageRatio = thumbPalmRatio(imageLandmarks);
    const rawRatio = worldRatio ?? imageRatio;
    if (rawRatio === null) return null;

    // Light smoothing removes single-frame landmark spikes without making the
    // start of a stroke feel sluggish.
    this.smoothedRatio = this.smoothedRatio === null
      ? rawRatio
      : this.smoothedRatio * 0.45 + rawRatio * 0.55;
    const ratio = this.smoothedRatio;

    if (this.calibrationStartedAt === null) {
      this.calibrationStartedAt = timestamp;
      this.openBaseline = ratio;
    } else if (this.pose === 'open' && this.candidate !== 'closed') {
      // Only let the baseline grow while open. A closing thumb must never drag
      // its own threshold downward and make the gesture impossible to finish.
      this.openBaseline = Math.max(this.openBaseline ?? ratio, ratio);
    }

    const baseline = this.openBaseline ?? ratio;
    if (!this.hasSeenOpen) {
      const explicitlyOpen = ratio >= this.config.openThreshold;
      const calibrated = timestamp - this.calibrationStartedAt >= this.config.calibrationMs;
      if (explicitlyOpen || calibrated) this.hasSeenOpen = true;
      return { pose: 'open', transition: null, ratio };
    }

    const adaptiveClose = Math.min(
      0.78,
      Math.max(0.5, baseline * this.config.relativeClose),
    );
    // Use the strongest directional evidence to begin a transition quickly;
    // dwell time still prevents a one-frame spike from completing it.
    const closeEvidenceRatio = Math.min(ratio, rawRatio);
    const openEvidenceRatio = Math.max(ratio, rawRatio);
    const meaningfulDrop = baseline - closeEvidenceRatio >= this.config.minimumCloseDrop;
    const closeRequested = meaningfulDrop && closeEvidenceRatio <= Math.max(
      this.config.closeThreshold,
      adaptiveClose,
    );
    const adaptiveOpen = Math.max(
      adaptiveClose + 0.075,
      Math.min(this.config.openThreshold, baseline * this.config.relativeOpen),
    );
    const openRequested = openEvidenceRatio >= adaptiveOpen;
    // Once a pose is established, only the opposite direction can begin a
    // transition. This keeps the smoothed tail of the old pose from masking a
    // decisive raw frame when the user reverses direction.
    const requested = this.pose === 'open'
      ? closeRequested ? 'closed' : openRequested ? 'open' : null
      : openRequested ? 'open' : closeRequested ? 'closed' : null;

    if (
      this.candidate &&
      timestamp - this.candidateLastSeenAt > this.config.candidateGraceMs
    ) {
      this.candidate = null;
    }

    if (requested === this.pose) {
      this.candidate = null;
      return { pose: this.pose, transition: null, ratio };
    }

    if (!requested) {
      // A short run through the dead band is normal when MediaPipe jitters.
      // Preserve the pending transition unless neutral evidence lasts long
      // enough to indicate that the user stopped the gesture.
      return { pose: 'transition', transition: null, ratio };
    }

    if (this.candidate !== requested) {
      this.candidate = requested;
      this.candidateSince = timestamp;
      this.candidateLastSeenAt = timestamp;
      return { pose: 'transition', transition: null, ratio };
    }

    this.candidateLastSeenAt = timestamp;
    if (timestamp - this.candidateSince < this.config.dwellMs) {
      return { pose: 'transition', transition: null, ratio };
    }

    this.pose = requested;
    this.candidate = null;
    return {
      pose: this.pose,
      transition: this.pose === 'closed' ? 'closed' : 'opened',
      ratio,
    };
  }

  reset(): void {
    this.pose = 'open';
    this.candidate = null;
    this.candidateSince = 0;
    this.candidateLastSeenAt = 0;
    this.hasSeenOpen = false;
    this.calibrationStartedAt = null;
    this.openBaseline = null;
    this.smoothedRatio = null;
  }
}
