import { describe, expect, it } from 'vitest';
import type { PointerPosition } from '../gestures/gestureTypes';
import { recognizeAirStroke } from './AirStrokeRecognizer';

function line(a: PointerPosition, b: PointerPosition, count = 20): PointerPosition[] {
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
  });
}

describe('recognizeAirStroke', () => {
  it('cleans up a rough rectangle', () => {
    const points = [
      ...line({ x: 20, y: 20 }, { x: 180, y: 20 }),
      ...line({ x: 180, y: 20 }, { x: 180, y: 110 }),
      ...line({ x: 180, y: 110 }, { x: 20, y: 110 }),
      ...line({ x: 20, y: 110 }, { x: 22, y: 22 }),
    ];
    expect(recognizeAirStroke(points)?.kind).toBe('rectangle');
  });

  it('recognizes an ellipse', () => {
    const points = Array.from({ length: 80 }, (_, index) => {
      const angle = index / 79 * Math.PI * 2;
      return { x: 100 + Math.cos(angle) * 75, y: 80 + Math.sin(angle) * 45 };
    });
    expect(recognizeAirStroke(points)?.kind).toBe('ellipse');
  });

  it('keeps a curved stroke curved', () => {
    const points = Array.from({ length: 50 }, (_, index) => ({
      x: 20 + index * 4,
      y: 30 + Math.sin(index / 49 * Math.PI) * 90,
    }));
    expect(recognizeAirStroke(points)?.kind).toBe('curve');
  });

  it('recognizes a genuinely straight stroke as a line', () => {
    expect(recognizeAirStroke(line({ x: 20, y: 30 }, { x: 220, y: 135 }))?.kind).toBe('line');
  });

  it('recognizes a one-stroke arrow without retaining its arrowhead scribble as the path', () => {
    const shaft = line({ x: 20, y: 70 }, { x: 190, y: 70 });
    const points = [
      ...shaft,
      { x: 154, y: 42 },
      { x: 190, y: 70 },
      { x: 154, y: 98 },
    ];
    const result = recognizeAirStroke(points);
    expect(result?.kind).toBe('connector');
    expect(result?.end).toEqual({ x: 190, y: 70 });
    expect(result?.points.at(-1)).toEqual({ x: 190, y: 70 });
  });
});
