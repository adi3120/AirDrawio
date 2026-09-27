import type { NormalizedLandmark } from '../tracking/handTypes';
import type { PointerPosition } from '../gestures/gestureTypes';

export interface CoordinateConfig {
  mirrorX: boolean;
  sensitivity: number;
  deadZonePx: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export class CoordinateMapper {
  constructor(
    private config: CoordinateConfig = {
      mirrorX: true,
      sensitivity: 1.25,
      deadZonePx: 1.5,
    },
  ) {}

  setConfig(config: Partial<CoordinateConfig>): void {
    this.config = { ...this.config, ...config };
  }

  map(point: NormalizedLandmark, bounds: DOMRect): PointerPosition {
    const sourceX = this.config.mirrorX ? 1 - point.x : point.x;
    const scaledX = 0.5 + (sourceX - 0.5) * this.config.sensitivity;
    const scaledY = 0.5 + (point.y - 0.5) * this.config.sensitivity;
    return {
      x: bounds.left + clamp(scaledX, 0, 1) * bounds.width,
      y: bounds.top + clamp(scaledY, 0, 1) * bounds.height,
    };
  }

  applyDeadZone(
    current: PointerPosition,
    previous: PointerPosition | null,
  ): PointerPosition {
    if (!previous) return current;
    return Math.hypot(current.x - previous.x, current.y - previous.y) <
      this.config.deadZonePx
      ? previous
      : current;
  }
}
