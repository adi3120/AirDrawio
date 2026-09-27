export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface HandFrame {
  landmarks: NormalizedLandmark[];
  worldLandmarks?: NormalizedLandmark[];
  confidence: number;
  timestamp: number;
}

export interface TrackingSnapshot {
  handDetected: boolean;
  confidence: number;
  fps: number;
  index: NormalizedLandmark | null;
  thumb: NormalizedLandmark | null;
  pinchRatio: number | null;
  pinchImageRatio: number | null;
  pinchWorldRatio: number | null;
  pinchSource: 'world' | 'image' | null;
}
