import { describe, expect, it } from 'vitest';
import { CoordinateMapper } from './CoordinateMapper';

describe('CoordinateMapper', () => {
  const bounds = {
    left: 100,
    top: 50,
    width: 800,
    height: 600,
  } as DOMRect;

  it('mirrors camera X into viewport coordinates', () => {
    const mapper = new CoordinateMapper({ mirrorX: true, sensitivity: 1, deadZonePx: 0 });
    expect(mapper.map({ x: 0.25, y: 0.5 }, bounds)).toEqual({ x: 700, y: 350 });
  });

  it('clamps sensitivity expansion to the viewport', () => {
    const mapper = new CoordinateMapper({ mirrorX: false, sensitivity: 2, deadZonePx: 0 });
    expect(mapper.map({ x: 0, y: 1 }, bounds)).toEqual({ x: 100, y: 650 });
  });

  it('freezes micro-movements inside the dead zone', () => {
    const mapper = new CoordinateMapper({ mirrorX: false, sensitivity: 1, deadZonePx: 3 });
    expect(mapper.applyDeadZone({ x: 11, y: 11 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
  });
});
