import type { HandFrame } from '../tracking/handTypes';
import { calculatePinchMeasurement, PinchDetector } from './PinchDetector';
import type { GestureEvent, GestureReading, PointerPosition } from './gestureTypes';
import { GestureStateMachine } from './GestureStateMachine';

export class GestureEngine {
  constructor(
    private readonly pinch = new PinchDetector(),
    private readonly stateMachine = new GestureStateMachine(),
    private confidenceThreshold = 0.6,
  ) {}

  update(frame: HandFrame, position: PointerPosition): {
    events: GestureEvent[];
    reading: GestureReading;
  } | null {
    if (frame.confidence < this.confidenceThreshold) return null;
    const index = frame.landmarks[8];
    const thumb = frame.landmarks[4];
    if (!index || !thumb) return null;

    const measurement = calculatePinchMeasurement(frame.landmarks, frame.worldLandmarks);
    const pinchPhase = this.pinch.update(measurement.ratio, frame.timestamp);
    const events = this.stateMachine.update({
      position,
      pinchPhase,
      timestamp: frame.timestamp,
    });

    return {
      events,
      reading: {
        index,
        thumb,
        pinchRatio: measurement.ratio,
        pinchImageRatio: measurement.imageRatio,
        pinchWorldRatio: measurement.worldRatio,
        pinchSource: measurement.source,
        confidence: frame.confidence,
      },
    };
  }

  handLost(timestamp: number): GestureEvent[] {
    this.pinch.forceRelease(timestamp);
    return this.stateMachine.handLost();
  }

  getState() {
    return this.stateMachine.getState();
  }

  setPinchThreshold(startThreshold: number): void {
    this.pinch.setConfig({
      startThreshold,
      releaseThreshold: Math.min(
        0.95,
        Math.max(startThreshold + 0.14, startThreshold * 1.35),
      ),
    });
  }

  setDoublePinchInterval(intervalMs: number): void {
    this.stateMachine.setDoublePinchInterval(intervalMs);
  }

  setConfidenceThreshold(value: number): void {
    this.confidenceThreshold = value;
  }
}
