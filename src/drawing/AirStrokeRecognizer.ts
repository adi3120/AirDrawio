import type { PointerPosition } from '../gestures/gestureTypes';

export type AirDrawingKind = 'rectangle' | 'ellipse' | 'line' | 'curve' | 'connector' | 'text';

export interface AirStrokeBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface RecognizedAirStroke {
  kind: AirDrawingKind;
  points: PointerPosition[];
  start: PointerPosition;
  end: PointerPosition;
  bounds: AirStrokeBounds;
  confidence: number;
}

function distance(a: PointerPosition, b: PointerPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function perpendicularDistance(point: PointerPosition, start: PointerPosition, end: PointerPosition): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return distance(point, start);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length;
}

export function simplifyStroke(points: PointerPosition[], epsilon: number): PointerPosition[] {
  if (points.length <= 2) return [...points];
  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const nextDistance = perpendicularDistance(points[index], points[0], points.at(-1)!);
    if (nextDistance > maxDistance) {
      maxDistance = nextDistance;
      splitIndex = index;
    }
  }
  if (maxDistance <= epsilon) return [points[0], points.at(-1)!];
  const left = simplifyStroke(points.slice(0, splitIndex + 1), epsilon);
  const right = simplifyStroke(points.slice(splitIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

function cleanPoints(points: PointerPosition[]): PointerPosition[] {
  const clean: PointerPosition[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (!clean.length || distance(clean.at(-1)!, point) >= 2) clean.push({ x: point.x, y: point.y });
  }
  return clean;
}

function getBounds(points: PointerPosition[]): AirStrokeBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function pathLength(points: PointerPosition[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
}

function detectArrowTip(
  points: PointerPosition[],
  diagonal: number,
): { point: PointerPosition; index: number } | null {
  if (points.length < 5) return null;
  const start = points[0];
  let tipIndex = 1;
  let farthest = 0;
  for (let index = 1; index < points.length; index += 1) {
    const next = distance(start, points[index]);
    if (next > farthest) {
      farthest = next;
      tipIndex = index;
    }
  }
  if (tipIndex < Math.floor(points.length * 0.42) || tipIndex >= points.length - 1) return null;
  const tip = points[tipIndex];
  const tail = points.slice(tipIndex + 1);
  const tailLength = pathLength([tip, ...tail]);
  if (farthest < diagonal * 0.62 || tailLength < diagonal * 0.16) return null;
  if (tail.every((point) => distance(point, tip) > diagonal * 0.45)) return null;
  return { point: tip, index: tipIndex };
}

export function recognizeAirStroke(input: PointerPosition[]): RecognizedAirStroke | null {
  const points = cleanPoints(input);
  if (points.length < 4) return null;
  const bounds = getBounds(points);
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal < 18) return null;
  const length = pathLength(points);
  const start = points[0];
  const last = points.at(-1)!;
  const closedness = distance(start, last) / diagonal;
  const isClosed = closedness < 0.3 && length > diagonal * 2.05;

  if (isClosed && bounds.width >= 22 && bounds.height >= 22) {
    const minDimension = Math.max(1, Math.min(bounds.width, bounds.height));
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const radiusX = Math.max(1, bounds.width / 2);
    const radiusY = Math.max(1, bounds.height / 2);
    const rectangleError = points.reduce((sum, point) => sum + Math.min(
      Math.abs(point.x - bounds.left),
      Math.abs(point.x - bounds.right),
      Math.abs(point.y - bounds.top),
      Math.abs(point.y - bounds.bottom),
    ) / minDimension, 0) / points.length;
    const ellipseError = points.reduce((sum, point) => {
      const radius = Math.hypot((point.x - centerX) / radiusX, (point.y - centerY) / radiusY);
      return sum + Math.abs(radius - 1);
    }, 0) / points.length;
    const rectangle = rectangleError < 0.14 && rectangleError < ellipseError * 0.86;
    return {
      kind: rectangle ? 'rectangle' : 'ellipse',
      points,
      start,
      end: last,
      bounds,
      confidence: Math.max(0.55, Math.min(0.98, 1 - (rectangle ? rectangleError : ellipseError))),
    };
  }

  const arrowTip = detectArrowTip(points, diagonal);
  if (arrowTip) {
    return {
      kind: 'connector',
      points: points.slice(0, arrowTip.index + 1),
      start,
      end: arrowTip.point,
      bounds,
      confidence: 0.82,
    };
  }

  const directDistance = distance(start, last);
  const maxDeviation = points.reduce(
    (maximum, point) => Math.max(maximum, perpendicularDistance(point, start, last)),
    0,
  );
  const straightness = directDistance / Math.max(length, 1);
  if (straightness > 0.84 && maxDeviation / diagonal < 0.1) {
    return { kind: 'line', points, start, end: last, bounds, confidence: straightness };
  }

  const simplified = simplifyStroke(points, Math.max(3, diagonal * 0.035));
  if (
    length / diagonal > 3.15 &&
    simplified.length >= 7 &&
    bounds.width >= 34 &&
    bounds.height >= 18
  ) {
    return { kind: 'text', points, start, end: last, bounds, confidence: 0.68 };
  }

  // Preserve an intentional bend. The controller turns these reduced points
  // into a maxGraph curved edge rather than replacing them with a chord.
  return {
    kind: 'curve',
    points: simplifyStroke(points, Math.max(4, diagonal * 0.025)),
    start,
    end: last,
    bounds,
    confidence: 0.76,
  };
}
