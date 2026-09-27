export interface InfiniteGridCss {
  gridSize: string;
  gridX: string;
  gridY: string;
  rulerSize: string;
  rulerX: string;
  rulerY: string;
}

function wrapOffset(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export function getInfiniteGridCss(
  gridSize: number,
  scale: number,
  translateX: number,
  translateY: number,
  previewX = 0,
  previewY = 0,
): InfiniteGridCss {
  const scaledGrid = Math.max(2, gridSize * scale);
  const majorGrid = scaledGrid * 5;
  const offsetX = translateX * scale + previewX;
  const offsetY = translateY * scale + previewY;
  return {
    gridSize: `${scaledGrid}px`,
    gridX: `${wrapOffset(offsetX - 1, scaledGrid)}px`,
    gridY: `${wrapOffset(offsetY - 1, scaledGrid)}px`,
    rulerSize: `${majorGrid}px`,
    rulerX: `${wrapOffset(offsetX, majorGrid)}px`,
    rulerY: `${wrapOffset(offsetY, majorGrid)}px`,
  };
}
