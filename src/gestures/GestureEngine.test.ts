import { describe, expect, it } from 'vitest';
import type { HandFrame, NormalizedLandmark } from '../tracking/handTypes';
import { GestureEngine } from './GestureEngine';

function frame(ratio: number, timestamp: number, confidence = 0.95): HandFrame {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 })) as NormalizedLandmark[];
  landmarks[0] = { x: 0.5, y: 1 };
  landmarks[4] = { x: 0, y: 0 };
  landmarks[8] = { x: ratio, y: 0 };
  landmarks[5] = { x: 0, y: 1 };
  landmarks[9] = { x: 0.5, y: 0 };
  landmarks[17] = { x: 1, y: 1 };
  return { landmarks, confidence, timestamp };
}

describe('GestureEngine synthetic sequence', () => {
  it('emits pinch, drag, and release for an open → pinch → move → release sequence', () => {
    const engine = new GestureEngine();
    engine.update(frame(0.8, 0), { x: 10, y: 10 });
    engine.update(frame(0.2, 10), { x: 10, y: 10 });
    const start = engine.update(frame(0.2, 70), { x: 10, y: 10 });
    const drag = engine.update(frame(0.2, 90), { x: 110, y: 10 });
    const dragMove = engine.update(frame(0.2, 110), { x: 125, y: 10 });
    const end = engine.update(frame(0.8, 140), { x: 125, y: 10 });

    expect(start?.events.map((event) => event.type)).toContain('PINCH_START');
    expect(drag?.events.map((event) => event.type)).toContain('DRAG_START');
    expect(dragMove?.events.map((event) => event.type)).toContain('DRAG_MOVE');
    expect(end?.events).toContainEqual(
      expect.objectContaining({ type: 'PINCH_END', wasDrag: true }),
    );
  });

  it('ignores low-confidence detections', () => {
    const engine = new GestureEngine();
    expect(engine.update(frame(0.2, 100, 0.2), { x: 1, y: 1 })).toBeNull();
  });

  it('resets safely when the hand disappears', () => {
    const engine = new GestureEngine();
    engine.update(frame(0.2, 0), { x: 10, y: 10 });
    engine.update(frame(0.2, 80), { x: 10, y: 10 });
    expect(engine.handLost(100)).toEqual([
      expect.objectContaining({ type: 'HAND_LOST' }),
    ]);
    expect(engine.getState()).toBe('IDLE');
  });
});
