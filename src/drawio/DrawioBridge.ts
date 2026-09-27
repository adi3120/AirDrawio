import type { Cell } from '@maxgraph/core';
import type { PointerPosition } from '../gestures/gestureTypes';
import type { AirDrawingKind } from '../drawing/AirStrokeRecognizer';
import type { DiagramExportFormat } from '../export/diagramExport';

export type DiagramTool = 'pointer' | 'arrow' | 'connector' | 'pan';
export type ShapeKind = 'rectangle' | 'ellipse' | 'text';

export interface AirDrawingResult {
  kind: AirDrawingKind;
  label: string;
}

export interface DrawioBridge {
  setTool(tool: DiagramTool): void;
  addShape(kind: ShapeKind): Cell;
  addShapeAtClientPoint(kind: ShapeKind, position: PointerPosition): Cell | null;
  createAirDrawing(points: PointerPosition[]): AirDrawingResult | null;
  undo(): void;
  redo(): void;
  deleteSelection(): void;
  copyAtClientPoint(position: PointerPosition | null): number;
  cutAtClientPoint(position: PointerPosition | null): number;
  pasteAtClientPoint(position: PointerPosition): number;
  startEditingSelection(): boolean;
  setSelectedLabel(label: string): boolean;
  setSelectedFillColor(color: string): boolean;
  getSelectedLabel(): string | null;
  zoomIn(): void;
  zoomOut(): void;
  zoomAtClientPoint(position: PointerPosition, factor: number): boolean;
  resetZoom(): void;
  exportDiagram(format: DiagramExportFormat): Promise<string>;
  destroy(): void;
}
