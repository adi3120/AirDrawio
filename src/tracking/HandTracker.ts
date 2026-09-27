import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { HandFrame, NormalizedLandmark } from './handTypes';

const MEDIAPIPE_VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface HandTrackerOptions {
  minDetectionConfidence: number;
  minPresenceConfidence: number;
  minTrackingConfidence: number;
}

const DEFAULT_OPTIONS: HandTrackerOptions = {
  minDetectionConfidence: 0.6,
  minPresenceConfidence: 0.6,
  minTrackingConfidence: 0.6,
};

export class HandTracker {
  private landmarker: HandLandmarker | null = null;

  constructor(private readonly options: HandTrackerOptions = DEFAULT_OPTIONS) {}

  async initialize(): Promise<void> {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    const create = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: this.options.minDetectionConfidence,
        minHandPresenceConfidence: this.options.minPresenceConfidence,
        minTrackingConfidence: this.options.minTrackingConfidence,
      });

    try {
      this.landmarker = await create('GPU');
    } catch {
      // GPU delegates are not available in every browser/driver combination.
      this.landmarker = await create('CPU');
    }
  }

  detect(video: HTMLVideoElement, timestamp: number): HandFrame | null {
    if (!this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    const result = this.landmarker.detectForVideo(video, timestamp);
    return this.toFrame(result, timestamp);
  }

  private toFrame(result: HandLandmarkerResult, timestamp: number): HandFrame | null {
    const landmarks = result.landmarks[0] as NormalizedLandmark[] | undefined;
    if (!landmarks?.length) return null;

    const worldLandmarks = result.worldLandmarks[0] as NormalizedLandmark[] | undefined;
    const confidence = result.handedness[0]?.[0]?.score ?? 0;
    return { landmarks, worldLandmarks, confidence, timestamp };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
