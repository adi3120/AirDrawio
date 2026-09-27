import { describe, expect, it } from 'vitest';
import { DoublePinchDetector } from './DoublePinchDetector';

describe('DoublePinchDetector', () => {
  it('recognizes a second pinch within the configured interval', () => {
    const detector = new DoublePinchDetector(400);
    expect(detector.registerPinchStart(100)).toBe(false);
    detector.registerPinchEnd(160);
    expect(detector.registerPinchStart(500)).toBe(true);
  });

  it('rejects a second pinch outside the interval', () => {
    const detector = new DoublePinchDetector(300);
    detector.registerPinchEnd(100);
    expect(detector.registerPinchStart(401)).toBe(false);
  });
});
