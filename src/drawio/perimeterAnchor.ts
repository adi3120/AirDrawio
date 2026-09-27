export type PerimeterSide = 'top' | 'right' | 'bottom' | 'left';

export interface PerimeterAnchor {
  x: number;
  y: number;
  side: PerimeterSide;
  label: string;
}

const MAGNET_DISTANCE = 0.14;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function magnetize(value: number): number {
  const clamped = clamp(value);
  if (clamped <= MAGNET_DISTANCE) return 0;
  if (clamped >= 1 - MAGNET_DISTANCE) return 1;
  if (Math.abs(clamped - 0.5) <= MAGNET_DISTANCE) return 0.5;
  return clamped;
}

function describeAnchor(x: number, y: number, side: PerimeterSide): string {
  if (x === 0 && y === 0) return 'top-left corner';
  if (x === 1 && y === 0) return 'top-right corner';
  if (x === 0 && y === 1) return 'bottom-left corner';
  if (x === 1 && y === 1) return 'bottom-right corner';
  if (y === 0 && x === 0.5) return 'top center';
  if (y === 1 && x === 0.5) return 'bottom center';
  if (x === 0 && y === 0.5) return 'left center';
  if (x === 1 && y === 0.5) return 'right center';
  return `${side} edge`;
}

/**
 * Projects an in-shape pointer position onto its closest perimeter. Positions
 * near corners and side centers are magnetized to those useful connection
 * points; all other positions remain at the corresponding exact edge point.
 */
export function snapToNearestPerimeter(normalizedX: number, normalizedY: number): PerimeterAnchor {
  const x = clamp(normalizedX);
  const y = clamp(normalizedY);
  const distances: Array<[PerimeterSide, number]> = [
    ['top', y],
    ['right', 1 - x],
    ['bottom', 1 - y],
    ['left', x],
  ];
  const side = distances.reduce((nearest, candidate) =>
    candidate[1] < nearest[1] ? candidate : nearest,
  )[0];

  let anchorX = x;
  let anchorY = y;
  if (side === 'top' || side === 'bottom') {
    anchorX = magnetize(x);
    anchorY = side === 'top' ? 0 : 1;
  } else {
    anchorX = side === 'left' ? 0 : 1;
    anchorY = magnetize(y);
  }

  return {
    x: anchorX,
    y: anchorY,
    side,
    label: describeAnchor(anchorX, anchorY, side),
  };
}
