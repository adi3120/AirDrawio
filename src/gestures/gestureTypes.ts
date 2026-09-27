import type { NormalizedLandmark } from '../tracking/handTypes';

export type GestureState =
  | 'IDLE'
  | 'HOVERING'
  | 'PINCHED'
  | 'DRAGGING'
  | 'DRAWING'
  | 'TEXT_EDIT'
  | 'PANNING';

export type PinchPhase = 'open' | 'candidate' | 'started' | 'held' | 'ended';

export interface PointerPosition {
  x: number;
  y: number;
}

export interface GestureInput {
  position: PointerPosition;
  pinchPhase: PinchPhase;
  timestamp: number;
}

export type GestureEvent =
  | { type: 'MOVE'; position: PointerPosition }
  | { type: 'PINCH_START'; position: PointerPosition }
  | { type: 'DRAG_START'; position: PointerPosition }
  | { type: 'DRAG_MOVE'; position: PointerPosition }
  | { type: 'PINCH_END'; position: PointerPosition; wasDrag: boolean }
  | { type: 'DOUBLE_PINCH'; position: PointerPosition }
  | { type: 'HAND_LOST'; position: PointerPosition | null };

export interface GestureReading {
  index: NormalizedLandmark;
  thumb: NormalizedLandmark;
  pinchRatio: number;
  pinchImageRatio: number;
  pinchWorldRatio: number | null;
  pinchSource: 'world' | 'image';
  confidence: number;
}
