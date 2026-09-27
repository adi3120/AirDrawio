import {
  Clipboard,
  Geometry,
  Graph,
  InternalEvent,
  Point,
  RubberBandHandler,
  UndoManager,
  getDefaultPlugins,
  type Cell,
  type CellStyle,
  type EventObject,
  type PanningHandler,
  type UndoableEdit,
} from '@maxgraph/core';
import type { AirDrawingResult, DiagramTool, DrawioBridge, ShapeKind } from './DrawioBridge';
import type { PointerPosition } from '../gestures/gestureTypes';
import { snapToNearestPerimeter, type PerimeterAnchor } from './perimeterAnchor';
import { recognizeAirStroke, simplifyStroke } from '../drawing/AirStrokeRecognizer';
import {
  createExportFileName,
  serializeDrawioFile,
  type DiagramExportFormat,
} from '../export/diagramExport';
import { createDiagramSvg, downloadBlob, rasterizeDiagram } from '../export/rasterExport';
import { getInfiniteGridCss } from './infiniteCanvas';

const NODE_STYLE: CellStyle = {
  rounded: true,
  arcSize: 16,
  fillColor: '#ffffff',
  strokeColor: '#b7c4d2',
  strokeWidth: 1.5,
  fontColor: '#14202b',
  fontSize: 15,
  fontFamily: 'Inter, ui-sans-serif, system-ui',
  shadow: false,
  whiteSpace: 'wrap',
  verticalAlign: 'middle',
  align: 'center',
  spacing: 8,
};

const EDGE_STYLE: CellStyle = {
  edgeStyle: 'orthogonalEdgeStyle',
  rounded: true,
  strokeColor: '#728294',
  strokeWidth: 2,
  endArrow: 'block',
  endFill: true,
  jettySize: 20,
};

const STRAIGHT_LINE_STYLE: CellStyle = {
  noEdgeStyle: true,
  rounded: false,
  strokeColor: '#53677a',
  strokeWidth: 2,
  startArrow: 'none',
  endArrow: 'none',
};

const CURVED_LINE_STYLE: CellStyle = {
  ...STRAIGHT_LINE_STYLE,
  curved: true,
};

export interface DrawioControllerOptions {
  onSelectionChange?: (cell: Cell | null, count: number) => void;
  onToolChange?: (tool: DiagramTool) => void;
  onNotice?: (message: string) => void;
}

export interface CellMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GestureTestFixture {
  subjectId: string;
  targetId: string;
}

export type VoiceAnchor = 'top' | 'bottom' | 'left' | 'right';

export type VoiceAnchorResult =
  | { status: 'source'; point: PointerPosition; label: string }
  | { status: 'connected'; label: string }
  | { status: 'miss'; label: string };

export type SmartConnectorResult =
  | { status: 'source'; point: PointerPosition; anchor: PerimeterAnchor; label: string }
  | { status: 'connected'; point: PointerPosition; anchor: PerimeterAnchor; label: string }
  | { status: 'miss'; label: string };

const VOICE_ANCHORS: Record<VoiceAnchor, readonly [number, number]> = {
  top: [0.5, 0],
  bottom: [0.5, 1],
  left: [0, 0.5],
  right: [1, 0.5],
};

const TEST_SUBJECT_ID = 'gesture-test-subject';
const TEST_TARGET_ID = 'gesture-test-target';

export class DrawioController implements DrawioBridge {
  readonly graph: Graph;
  private readonly undoManager = new UndoManager(120);
  private readonly undoListener: (sender: unknown, evt: EventObject) => void;
  private readonly selectionListener: () => void;
  private tool: DiagramTool = 'pointer';
  private pendingVoiceConnector: { cell: Cell; anchor: VoiceAnchor } | null = null;
  private pendingSmartConnector: { cell: Cell; anchor: PerimeterAnchor } | null = null;
  private lineGesture: {
    pointerId: number;
    startLocal: Point;
    startModel: Point;
    dragged: boolean;
  } | null = null;
  private connectorGesture: {
    pointerId: number;
    start: PointerPosition;
    dragged: boolean;
  } | null = null;
  private linePreview: HTMLDivElement | null = null;
  private smartConnectorPreview: {
    line: HTMLDivElement;
    source: HTMLDivElement;
    target: HTMLDivElement;
  } | null = null;
  private readonly viewTransformListener = () => this.updateInfiniteCanvasGrid();
  private readonly panPreviewListener = () => {
    const panning = this.graph.getPlugin<PanningHandler>('PanningHandler');
    this.updateInfiniteCanvasGrid(panning?.dx ?? 0, panning?.dy ?? 0);
  };
  private readonly panEndListener = () => this.updateInfiniteCanvasGrid();

  private readonly linePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) return;
    if (this.tool === 'connector') {
      this.connectorGesture = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        dragged: false,
      };
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.tool !== 'arrow') return;
    const local = this.clientToLocalPoint(event.clientX, event.clientY);
    this.lineGesture = {
      pointerId: event.pointerId,
      startLocal: local,
      startModel: this.localToModelPoint(local),
      dragged: false,
    };
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly linePointerMove = (event: PointerEvent) => {
    if (this.pendingSmartConnector && this.tool === 'connector') {
      this.updateSmartConnectorPreview({ x: event.clientX, y: event.clientY });
    }

    const connectorGesture = this.connectorGesture;
    if (connectorGesture && event.pointerId === connectorGesture.pointerId) {
      if (Math.hypot(
        event.clientX - connectorGesture.start.x,
        event.clientY - connectorGesture.start.y,
      ) >= 6) {
        connectorGesture.dragged = true;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const gesture = this.lineGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const local = this.clientToLocalPoint(event.clientX, event.clientY);
    if (!gesture.dragged && Math.hypot(local.x - gesture.startLocal.x, local.y - gesture.startLocal.y) >= 6) {
      gesture.dragged = true;
      this.linePreview = document.createElement('div');
      this.linePreview.className = 'line-draw-preview';
      this.container.appendChild(this.linePreview);
    }
    if (gesture.dragged) this.updateLinePreview(gesture.startLocal, local);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly linePointerUp = (event: PointerEvent) => {
    const connectorGesture = this.connectorGesture;
    if (connectorGesture && event.pointerId === connectorGesture.pointerId) {
      this.connectorGesture = null;
      if (!connectorGesture.dragged) {
        const position = { x: event.clientX, y: event.clientY };
        const result = this.pendingSmartConnector
          ? this.finishSmartConnectorAtClientPoint(position)
          : this.startSmartConnectorAtClientPoint(position);
        this.options.onNotice?.(result.label);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const gesture = this.lineGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const local = this.clientToLocalPoint(event.clientX, event.clientY);
    if (gesture.dragged) {
      this.createStraightLine(gesture.startModel, this.localToModelPoint(local));
      this.options.onNotice?.('Straight line created. Switch to Pointer to select or move it.');
    }
    this.resetLineGesture();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly lineClick = (event: MouseEvent) => {
    if (this.tool !== 'arrow' && this.tool !== 'connector') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly options: DrawioControllerOptions = {},
  ) {
    InternalEvent.disableContextMenu(container);
    this.graph = new Graph(container, undefined, [...getDefaultPlugins(), RubberBandHandler]);

    this.configureGraph();
    const view = this.graph.getView();
    view.addListener(InternalEvent.SCALE, this.viewTransformListener);
    view.addListener(InternalEvent.TRANSLATE, this.viewTransformListener);
    view.addListener(InternalEvent.SCALE_AND_TRANSLATE, this.viewTransformListener);
    const panning = this.graph.getPlugin<PanningHandler>('PanningHandler');
    panning?.addListener(InternalEvent.PAN, this.panPreviewListener);
    panning?.addListener(InternalEvent.PAN_END, this.panEndListener);
    this.updateInfiniteCanvasGrid();
    // Marquee selection is intended for movable diagram objects. Selecting the
    // connector edges between them as extra cells can make a group drag alter
    // edge geometry independently of its endpoints.
    this.graph.selectRegion = (rect, event) => {
      const cells = this.graph
        .getCells(rect.x, rect.y, rect.width, rect.height)
        .filter((cell) => cell.isVertex());
      this.graph.selectCellsForEvent(cells, event);
      return cells;
    };
    this.undoListener = (_sender, evt) => {
      const edit = evt.getProperty('edit') as UndoableEdit | undefined;
      if (edit) this.undoManager.undoableEditHappened(edit);
    };
    this.graph.getDataModel().addListener(InternalEvent.UNDO, this.undoListener);
    this.graph.getView().addListener(InternalEvent.UNDO, this.undoListener);

    this.selectionListener = () => {
      const cells = this.graph.getSelectionCells();
      this.options.onSelectionChange?.(cells[0] ?? null, cells.length);
    };
    this.graph
      .getSelectionModel()
      .addListener(InternalEvent.CHANGE, this.selectionListener);

    this.container.addEventListener('pointerdown', this.linePointerDown, true);
    document.addEventListener('pointermove', this.linePointerMove, true);
    document.addEventListener('pointerup', this.linePointerUp, true);
    this.container.addEventListener('click', this.lineClick, true);

    this.seedDiagram();
  }

  private configureGraph(): void {
    // Connections are created through the explicit Connector Arrow tool and exact-side
    // voice commands. The native connection handler otherwise steals a normal
    // drag that begins on a selected shape.
    this.graph.setConnectable(false);
    this.graph.setAllowDanglingEdges(true);
    this.graph.setPanning(true);
    // Translate the graph view instead of scrolling a finite HTML element.
    // This gives the workspace no left/right/top/bottom boundary.
    this.graph.useScrollbarsForPanning = false;
    this.graph.setTooltips(true);
    this.graph.setGridEnabled(true);
    this.graph.setGridSize(16);
    this.graph.setHtmlLabels(false);
    this.graph.setCellsResizable(true);
    this.graph.setCellsMovable(true);
    this.graph.setCellsEditable(true);
    this.graph.setCellsSelectable(true);
    this.graph.setDisconnectOnMove(false);
    this.graph.setDropEnabled(false);
    this.graph.options.foldingEnabled = false;

    Object.assign(
      this.graph.getStylesheet().getDefaultVertexStyle(),
      NODE_STYLE,
    );
    Object.assign(this.graph.getStylesheet().getDefaultEdgeStyle(), EDGE_STYLE);

    const panning = this.graph.getPlugin<PanningHandler>('PanningHandler');
    if (panning) panning.useLeftButtonForPanning = false;
  }

  private updateInfiniteCanvasGrid(previewX = 0, previewY = 0): void {
    const view = this.graph.getView();
    const translate = view.getTranslate();
    const grid = getInfiniteGridCss(
      this.graph.getGridSize(),
      view.getScale(),
      translate.x,
      translate.y,
      previewX,
      previewY,
    );
    const shell = this.container.closest<HTMLElement>('.canvas-shell');
    const style = shell?.style ?? this.container.style;
    style.setProperty('--canvas-grid-size', grid.gridSize);
    style.setProperty('--canvas-grid-x', grid.gridX);
    style.setProperty('--canvas-grid-y', grid.gridY);
    style.setProperty('--canvas-ruler-size', grid.rulerSize);
    style.setProperty('--canvas-ruler-x', grid.rulerX);
    style.setProperty('--canvas-ruler-y', grid.rulerY);
  }

  private seedDiagram(): void {
    const parent = this.graph.getDefaultParent();
    this.graph.batchUpdate(() => {
      const client = this.graph.insertVertex({
        parent,
        id: 'client',
        value: 'Web client',
        position: [90, 100],
        size: [150, 68],
        style: { ...NODE_STYLE, fillColor: '#ecfeff', strokeColor: '#5eead4' },
      });
      const gateway = this.graph.insertVertex({
        parent,
        id: 'gateway',
        value: 'API gateway',
        position: [370, 100],
        size: [160, 68],
        style: { ...NODE_STYLE, fillColor: '#f5f3ff', strokeColor: '#a78bfa' },
      });
      const service = this.graph.insertVertex({
        parent,
        id: 'service',
        value: 'Auth service',
        position: [370, 270],
        size: [160, 68],
        style: { ...NODE_STYLE, fillColor: '#fff7ed', strokeColor: '#fb923c' },
      });
      const database = this.graph.insertVertex({
        parent,
        id: 'database',
        value: 'PostgreSQL',
        position: [650, 270],
        size: [160, 68],
        style: { ...NODE_STYLE, shape: 'cylinder', fillColor: '#eff6ff', strokeColor: '#60a5fa' },
      });

      this.graph.insertEdge({ parent, source: client, target: gateway, style: EDGE_STYLE });
      this.graph.insertEdge({ parent, source: gateway, target: service, style: EDGE_STYLE });
      this.graph.insertEdge({ parent, source: service, target: database, style: EDGE_STYLE });
    });
    this.undoManager.clear();
  }

  setTool(tool: DiagramTool): void {
    if (tool !== 'connector') this.cancelSmartConnector();
    this.tool = tool;
    this.pendingVoiceConnector = null;
    const panning = this.graph.getPlugin<PanningHandler>('PanningHandler');
    const rubberBand = this.graph.getPlugin<RubberBandHandler>('RubberBandHandler');
    const isPan = tool === 'pan';
    if (panning) panning.useLeftButtonForPanning = isPan;
    if (rubberBand) rubberBand.setEnabled(tool === 'pointer');
    this.graph.setCellsSelectable(!isPan);
    this.container.classList.toggle('is-pan-mode', isPan);
    this.container.classList.toggle('is-arrow-mode', tool === 'arrow');
    this.container.classList.toggle('is-connector-mode', tool === 'connector');
    this.options.onToolChange?.(tool);
    if (tool === 'arrow') {
      this.options.onNotice?.('Hold and drag anywhere to draw a free straight line.');
    } else if (tool === 'connector') {
      this.options.onNotice?.('Point to a shape and say “Start Arrow”, then point to another shape and say “select”.');
    }
  }

  addShape(kind: ShapeKind): Cell {
    const bounds = this.container.getBoundingClientRect();
    const center = this.localToModelPoint(new Point(
      this.container.scrollLeft + bounds.width / 2,
      this.container.scrollTop + bounds.height / 2,
    ));
    return this.insertShapeAtModelPoint(kind, center, true);
  }

  addShapeAtClientPoint(kind: ShapeKind, position: PointerPosition): Cell | null {
    const bounds = this.container.getBoundingClientRect();
    if (
      position.x < bounds.left ||
      position.x > bounds.right ||
      position.y < bounds.top ||
      position.y > bounds.bottom
    ) return null;

    const center = this.localToModelPoint(this.clientToLocalPoint(position.x, position.y));
    return this.insertShapeAtModelPoint(kind, center, false);
  }

  private insertShapeAtModelPoint(kind: ShapeKind, center: Point, ensureVisible: boolean): Cell {
    const parent = this.graph.getDefaultParent();
    const width = kind === 'text' ? 150 : 180;
    const height = kind === 'text' ? 44 : 68;

    const cell = this.graph.insertVertex({
      parent,
      value: kind === 'text' ? 'Label' : kind === 'ellipse' ? 'Process' : 'New component',
      position: [center.x - width / 2, center.y - height / 2],
      size: [width, height],
      style:
        kind === 'ellipse'
          ? { ...NODE_STYLE, shape: 'ellipse', fillColor: '#f0fdf4', strokeColor: '#4ade80' }
          : kind === 'text'
            ? { ...NODE_STYLE, fillColor: 'none', strokeColor: 'none', fontSize: 18 }
            : { ...NODE_STYLE, fillColor: '#ffffff', strokeColor: '#64748b' },
    });
    this.graph.setSelectionCell(cell);
    if (ensureVisible) this.graph.scrollCellToVisible(cell);
    this.setTool('pointer');
    if (kind === 'text') this.graph.startEditingAtCell(cell);
    return cell;
  }

  createAirDrawing(points: PointerPosition[]): AirDrawingResult | null {
    const inside = points.filter((point) => this.isInsideCanvas(point));
    const recognized = recognizeAirStroke(inside);
    if (!recognized) return null;

    if (recognized.kind === 'rectangle' || recognized.kind === 'ellipse' || recognized.kind === 'text') {
      const topLeft = this.localToModelPoint(this.clientToLocalPoint(
        recognized.bounds.left,
        recognized.bounds.top,
      ));
      const bottomRight = this.localToModelPoint(this.clientToLocalPoint(
        recognized.bounds.right,
        recognized.bounds.bottom,
      ));
      const width = Math.max(recognized.kind === 'text' ? 90 : 42, bottomRight.x - topLeft.x);
      const height = Math.max(recognized.kind === 'text' ? 36 : 42, bottomRight.y - topLeft.y);
      const parent = this.graph.getDefaultParent();
      const cell = this.graph.insertVertex({
        parent,
        value: recognized.kind === 'text'
          ? 'Text'
          : recognized.kind === 'ellipse'
            ? 'Process'
            : 'New component',
        position: [topLeft.x, topLeft.y],
        size: [width, height],
        style: recognized.kind === 'ellipse'
          ? { ...NODE_STYLE, shape: 'ellipse', fillColor: '#f0fdf4', strokeColor: '#4ade80' }
          : recognized.kind === 'text'
            ? { ...NODE_STYLE, fillColor: 'none', strokeColor: 'none', fontSize: 18 }
            : { ...NODE_STYLE, fillColor: '#ffffff', strokeColor: '#64748b' },
      });
      this.graph.setSelectionCell(cell);
      if (recognized.kind === 'text') this.graph.startEditingAtCell(cell);
      return {
        kind: recognized.kind,
        label: recognized.kind === 'text'
          ? 'Text area created. Type or dictate the text.'
          : `${recognized.kind === 'ellipse' ? 'Ellipse' : 'Rectangle'} cleaned up and created.`,
      };
    }

    const sourceCell = this.getVertexAtClientPoint(recognized.start);
    const targetCell = this.getVertexAtClientPoint(recognized.end);
    const connectsShapes = Boolean(sourceCell && targetCell && sourceCell !== targetCell);
    if (connectsShapes && sourceCell && targetCell) {
      const sourceAnchor = this.getPerimeterAnchor(sourceCell, recognized.start);
      const targetAnchor = this.getPerimeterAnchor(targetCell, recognized.end);
      if (sourceAnchor && targetAnchor) {
        const edge = this.graph.insertEdge({
          parent: this.graph.getDefaultParent(),
          source: sourceCell,
          target: targetCell,
          style: {
            ...EDGE_STYLE,
            noEdgeStyle: recognized.kind === 'curve',
            curved: recognized.kind === 'curve',
            exitX: sourceAnchor.anchor.x,
            exitY: sourceAnchor.anchor.y,
            exitPerimeter: true,
            entryX: targetAnchor.anchor.x,
            entryY: targetAnchor.anchor.y,
            entryPerimeter: true,
          },
        });
        if (recognized.kind === 'curve') {
          const geometry = edge.getGeometry()?.clone() ?? new Geometry();
          geometry.relative = true;
          geometry.points = this.getAirCurveControlPoints(recognized.points);
          this.graph.getDataModel().setGeometry(edge, geometry);
        }
        this.graph.setSelectionCell(edge);
        return { kind: 'connector', label: 'Connector arrow attached cleanly to both shapes.' };
      }
    }

    if (recognized.kind === 'line') {
      this.createStraightLine(
        this.localToModelPoint(this.clientToLocalPoint(recognized.start.x, recognized.start.y)),
        this.localToModelPoint(this.clientToLocalPoint(recognized.end.x, recognized.end.y)),
      );
      return { kind: 'line', label: 'Straight line cleaned up and created.' };
    }

    const isConnector = recognized.kind === 'connector';
    this.createSmoothAirEdge(recognized.points, recognized.start, recognized.end, isConnector);
    return {
      kind: isConnector ? 'connector' : 'curve',
      label: isConnector
        ? 'Connector arrow cleaned up and created.'
        : 'Curved line smoothed without straightening it.',
    };
  }

  private createSmoothAirEdge(
    points: PointerPosition[],
    start: PointerPosition,
    end: PointerPosition,
    arrow: boolean,
  ): Cell {
    let edge!: Cell;
    this.graph.batchUpdate(() => {
      edge = this.graph.insertEdge({
        parent: this.graph.getDefaultParent(),
        source: null,
        target: null,
        style: {
          ...CURVED_LINE_STYLE,
          endArrow: arrow ? 'block' : 'none',
          endFill: arrow,
        },
      });
      const geometry = edge.getGeometry()?.clone() ?? new Geometry();
      geometry.relative = true;
      geometry.setTerminalPoint(
        this.localToModelPoint(this.clientToLocalPoint(start.x, start.y)),
        true,
      );
      geometry.setTerminalPoint(
        this.localToModelPoint(this.clientToLocalPoint(end.x, end.y)),
        false,
      );
      geometry.points = this.getAirCurveControlPoints(points);
      this.graph.getDataModel().setGeometry(edge, geometry);
    });
    this.graph.setSelectionCell(edge);
    return edge;
  }

  private getAirCurveControlPoints(points: PointerPosition[]): Point[] {
    if (points.length <= 2) return [];
    const reduced = simplifyStroke(points, 5);
    const interior = reduced.slice(1, -1);
    const stride = Math.max(1, Math.ceil(interior.length / 12));
    return interior
      .filter((_, index) => index % stride === 0)
      .map((point) => this.localToModelPoint(this.clientToLocalPoint(point.x, point.y)));
  }

  private isInsideCanvas(position: PointerPosition): boolean {
    const bounds = this.container.getBoundingClientRect();
    return position.x >= bounds.left && position.x <= bounds.right &&
      position.y >= bounds.top && position.y <= bounds.bottom;
  }

  private createStraightLine(start: Point, end: Point): Cell {
    let edge!: Cell;
    this.graph.batchUpdate(() => {
      edge = this.graph.insertEdge({
        parent: this.graph.getDefaultParent(),
        source: null,
        target: null,
        style: STRAIGHT_LINE_STYLE,
      });
      const geometry = edge.getGeometry()?.clone() ?? new Geometry();
      geometry.relative = true;
      geometry.setTerminalPoint(start, true);
      geometry.setTerminalPoint(end, false);
      this.graph.getDataModel().setGeometry(edge, geometry);
    });
    this.graph.setSelectionCell(edge);
    return edge;
  }

  private clientToLocalPoint(clientX: number, clientY: number): Point {
    const bounds = this.container.getBoundingClientRect();
    return new Point(
      clientX - bounds.left + this.container.scrollLeft,
      clientY - bounds.top + this.container.scrollTop,
    );
  }

  private localToModelPoint(local: Point): Point {
    const scale = this.graph.getView().getScale();
    const translate = this.graph.getView().getTranslate();
    return new Point(
      this.graph.snap(local.x / scale - translate.x),
      this.graph.snap(local.y / scale - translate.y),
    );
  }

  private updateLinePreview(start: Point, end: Point): void {
    if (!this.linePreview) return;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    this.linePreview.style.left = `${start.x}px`;
    this.linePreview.style.top = `${start.y}px`;
    this.linePreview.style.width = `${Math.hypot(dx, dy)}px`;
    this.linePreview.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }

  private resetLineGesture(): void {
    this.lineGesture = null;
    this.linePreview?.remove();
    this.linePreview = null;
  }

  undo(): void {
    if (this.undoManager.canUndo()) this.undoManager.undo();
  }

  redo(): void {
    if (this.undoManager.canRedo()) this.undoManager.redo();
  }

  deleteSelection(): void {
    const cells = this.graph.getSelectionCells();
    if (cells.length) this.graph.removeCells(cells);
  }

  copyAtClientPoint(position: PointerPosition | null): number {
    const cells = this.getClipboardSourceCells(position);
    if (!cells.length) return 0;
    Clipboard.copy(this.graph, cells);
    return cells.filter((cell) => cell.isVertex()).length || cells.length;
  }

  cutAtClientPoint(position: PointerPosition | null): number {
    const cells = this.getClipboardSourceCells(position);
    if (!cells.length) return 0;
    Clipboard.copy(this.graph, cells);
    this.graph.removeCells(cells);
    return cells.filter((cell) => cell.isVertex()).length || cells.length;
  }

  pasteAtClientPoint(position: PointerPosition): number {
    const bounds = this.container.getBoundingClientRect();
    if (
      position.x < bounds.left ||
      position.x > bounds.right ||
      position.y < bounds.top ||
      position.y > bounds.bottom ||
      Clipboard.isEmpty()
    ) return 0;

    const cells = Clipboard.paste(this.graph) ?? [];
    if (!cells.length) return 0;
    const vertices = cells.filter((cell) => cell.isVertex());
    const cellBounds = this.graph.getBoundingBoxFromGeometry(
      vertices.length ? vertices : cells,
      true,
    );
    if (cellBounds) {
      const target = this.localToModelPoint(this.clientToLocalPoint(position.x, position.y));
      this.graph.moveCells(
        cells,
        target.x - (cellBounds.x + cellBounds.width / 2),
        target.y - (cellBounds.y + cellBounds.height / 2),
      );
    }
    this.graph.setSelectionCells(cells);
    this.setTool('pointer');
    return vertices.length || cells.length;
  }

  private getClipboardSourceCells(position: PointerPosition | null): Cell[] {
    let cells = this.graph.getSelectionCells();
    // A multi-selection is intentional and wins over the hovered cell. For a
    // single/no selection, hovering chooses the object the user means.
    if (cells.length <= 1 && position) {
      const hovered = this.getVertexAtClientPoint(position);
      if (hovered) {
        cells = [hovered];
        this.graph.setSelectionCell(hovered);
      }
    }
    if (!cells.length) return [];

    // Preserve connectors whose two endpoints are both inside the copied
    // group, even though marquee selection intentionally selects vertices only.
    const result = new Set(cells);
    const selectedVertices = new Set(cells.filter((cell) => cell.isVertex()));
    for (const vertex of selectedVertices) {
      for (const edge of vertex.getEdges()) {
        const source = edge.getTerminal(true);
        const target = edge.getTerminal(false);
        if (source && target && selectedVertices.has(source) && selectedVertices.has(target)) {
          result.add(edge);
        }
      }
    }
    return [...result];
  }

  startEditingSelection(): boolean {
    const cell = this.graph.getSelectionCell();
    if (!cell) return false;
    this.graph.startEditingAtCell(cell);
    this.focusAndSelectEditorText();
    return true;
  }

  selectCellAtClientPoint(position: PointerPosition): boolean {
    const cell = this.getVertexAtClientPoint(position);
    if (!cell) return false;
    this.graph.setSelectionCell(cell);
    return true;
  }

  selectAndEditCellAtClientPoint(position: PointerPosition): boolean {
    const cell = this.getVertexAtClientPoint(position);
    if (!cell) return false;
    this.graph.setSelectionCell(cell);
    this.graph.startEditingAtCell(cell);
    this.focusAndSelectEditorText();
    return true;
  }

  beginRenameAtClientPoint(position: PointerPosition): boolean {
    return this.selectAndEditCellAtClientPoint(position);
  }

  isEditing(): boolean {
    return this.graph.isEditing();
  }

  removeTrailingRenameCommand(): void {
    const editor = this.container.querySelector<HTMLElement>('.mxCellEditor[contenteditable="true"]');
    if (!editor) return;
    const current = editor.innerText || editor.textContent || '';
    const cleaned = current
      .replace(/(?:\s+|^)(?:done|finish rename)[.!?]*\s*$/i, '')
      .trimEnd();
    if (cleaned !== current) editor.textContent = cleaned;
  }

  private focusAndSelectEditorText(): void {
    window.setTimeout(() => {
      const editor = this.container.querySelector<HTMLElement>('.mxCellEditor[contenteditable="true"]');
      if (!editor) return;
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, 0);
  }

  hasPendingSmartConnector(): boolean {
    return Boolean(this.pendingSmartConnector);
  }

  startSmartConnectorAtClientPoint(position: PointerPosition): SmartConnectorResult {
    const cell = this.getVertexAtClientPoint(position);
    if (!cell) {
      return { status: 'miss', label: 'Point inside a shape, then say “Start Arrow”.' };
    }

    const snapped = this.getPerimeterAnchor(cell, position);
    if (!snapped) {
      return { status: 'miss', label: 'That shape is not ready for a connector yet.' };
    }

    this.pendingSmartConnector = { cell, anchor: snapped.anchor };
    this.graph.setSelectionCell(cell);
    this.createSmartConnectorPreview();
    this.updateSmartConnectorPreview(position);
    return {
      status: 'source',
      point: snapped.point,
      anchor: snapped.anchor,
      label: `Arrow started at the ${snapped.anchor.label}. Move to another shape and say “select” or “End Arrow”.`,
    };
  }

  finishSmartConnectorAtClientPoint(position: PointerPosition): SmartConnectorResult {
    const source = this.pendingSmartConnector;
    if (!source) {
      return { status: 'miss', label: 'Say “Start Arrow” over the source shape first.' };
    }

    const cell = this.getVertexAtClientPoint(position);
    if (!cell) {
      return { status: 'miss', label: 'Point inside the destination shape, then say “select” or “End Arrow”.' };
    }
    if (cell === source.cell) {
      return { status: 'miss', label: 'Move to a different shape before ending the arrow.' };
    }

    const snapped = this.getPerimeterAnchor(cell, position);
    if (!snapped) {
      return { status: 'miss', label: 'The destination could not be attached. Point inside it and try again.' };
    }

    this.graph.insertEdge({
      parent: this.graph.getDefaultParent(),
      source: source.cell,
      target: cell,
      style: {
        ...EDGE_STYLE,
        exitX: source.anchor.x,
        exitY: source.anchor.y,
        exitPerimeter: true,
        entryX: snapped.anchor.x,
        entryY: snapped.anchor.y,
        entryPerimeter: true,
      },
    });
    this.graph.setSelectionCell(cell);
    this.pendingSmartConnector = null;
    this.removeSmartConnectorPreview();
    return {
      status: 'connected',
      point: snapped.point,
      anchor: snapped.anchor,
      label: `Arrow attached to the destination’s ${snapped.anchor.label}.`,
    };
  }

  cancelSmartConnector(): void {
    this.pendingSmartConnector = null;
    this.connectorGesture = null;
    this.removeSmartConnectorPreview();
  }

  selectVoiceAnchorAtClientPoint(
    position: PointerPosition,
    anchor: VoiceAnchor,
  ): VoiceAnchorResult {
    const cell = this.getVertexAtClientPoint(position);
    if (!cell) {
      return { status: 'miss', label: `Hover over a shape, then say “select ${anchor}”.` };
    }

    if (!this.pendingVoiceConnector) {
      this.pendingVoiceConnector = { cell, anchor };
      this.graph.setSelectionCell(cell);
      const point = this.getAnchorClientPoint(cell, anchor) ?? position;
      return {
        status: 'source',
        point,
        label: `${anchor} source latched. Point at another shape and name its connection side.`,
      };
    }

    if (cell === this.pendingVoiceConnector.cell) {
      return { status: 'miss', label: 'Move to a different shape before selecting the destination point.' };
    }

    const [exitX, exitY] = VOICE_ANCHORS[this.pendingVoiceConnector.anchor];
    const [entryX, entryY] = VOICE_ANCHORS[anchor];
    this.graph.insertEdge({
      parent: this.graph.getDefaultParent(),
      source: this.pendingVoiceConnector.cell,
      target: cell,
      style: {
        ...EDGE_STYLE,
        exitX,
        exitY,
        exitPerimeter: true,
        entryX,
        entryY,
        entryPerimeter: true,
      },
    });
    this.graph.setSelectionCell(cell);
    this.pendingVoiceConnector = null;
    return {
      status: 'connected',
      label: `Connector attached to the destination’s ${anchor} point.`,
    };
  }

  cancelVoiceConnector(): void {
    this.pendingVoiceConnector = null;
  }

  setSelectedLabel(label: string): boolean {
    const cell = this.graph.getSelectionCell();
    if (!cell) return false;
    this.graph.cellLabelChanged(cell, label, false);
    return true;
  }

  setSelectedFillColor(color: string): boolean {
    const cell = this.graph.getSelectionCell();
    if (!cell?.isVertex()) return false;
    this.graph.setCellStyles('fillColor', color, [cell]);
    return true;
  }

  getSelectedLabel(): string | null {
    const cell = this.graph.getSelectionCell();
    return cell ? String(cell.getValue() ?? '') : null;
  }

  zoomIn(): void {
    this.graph.zoomIn();
  }

  zoomOut(): void {
    this.graph.zoomOut();
  }

  zoomAtClientPoint(position: PointerPosition, factor: number): boolean {
    if (!Number.isFinite(factor) || factor <= 0) return false;
    const bounds = this.container.getBoundingClientRect();
    if (
      position.x < bounds.left ||
      position.x > bounds.right ||
      position.y < bounds.top ||
      position.y > bounds.bottom
    ) return false;

    const view = this.graph.getView();
    const currentScale = view.getScale();
    const nextScale = Math.min(4, Math.max(0.35, currentScale * factor));
    if (Math.abs(nextScale - currentScale) < 0.001) return false;

    const translate = view.getTranslate();
    const viewportX = position.x - bounds.left;
    const viewportY = position.y - bounds.top;
    const canvasX = this.container.scrollLeft + viewportX;
    const canvasY = this.container.scrollTop + viewportY;
    const modelX = canvasX / currentScale - translate.x;
    const modelY = canvasY / currentScale - translate.y;

    // Change scale and translation together so the model coordinate currently
    // under the hand remains under that same pointer after zooming.
    view.scaleAndTranslate(
      nextScale,
      canvasX / nextScale - modelX,
      canvasY / nextScale - modelY,
    );
    return true;
  }

  resetZoom(): void {
    this.graph.zoomActual();
  }

  async exportDiagram(format: DiagramExportFormat): Promise<string> {
    if (this.graph.isEditing()) this.graph.stopEditing(false);
    const fileName = createExportFileName(format);
    if (format === 'drawio') {
      const root = this.graph.getDataModel().getRoot();
      if (!root) throw new Error('The diagram model is empty.');
      const xml = serializeDrawioFile(root);
      downloadBlob(
        new Blob([xml], { type: 'application/vnd.jgraph.mxfile;charset=utf-8' }),
        fileName,
      );
      return fileName;
    }

    const svg = createDiagramSvg(this.graph);
    const image = await rasterizeDiagram(svg, format);
    downloadBlob(image, fileName);
    return fileName;
  }

  prepareGestureTestFixture(): GestureTestFixture {
    this.clearGestureTestFixture();
    const parent = this.graph.getDefaultParent();
    const bounds = this.container.getBoundingClientRect();
    const scale = this.graph.getView().getScale();
    const translate = this.graph.getView().getTranslate();
    const centerX = (this.container.scrollLeft + bounds.width / 2) / scale - translate.x;
    const centerY = (this.container.scrollTop + bounds.height / 2) / scale - translate.y;

    this.graph.batchUpdate(() => {
      this.graph.insertVertex({
        parent,
        id: TEST_SUBJECT_ID,
        value: 'Gesture test block',
        position: [centerX - 285, centerY + 80],
        size: [185, 72],
        style: {
          ...NODE_STYLE,
          fillColor: '#ecfeff',
          strokeColor: '#14b8a6',
          strokeWidth: 2.5,
        },
      });
      this.graph.insertVertex({
        parent,
        id: TEST_TARGET_ID,
        value: 'Gesture test target',
        position: [centerX + 115, centerY + 80],
        size: [185, 72],
        style: {
          ...NODE_STYLE,
          fillColor: '#f0fdf4',
          strokeColor: '#22c55e',
          strokeWidth: 2.5,
        },
      });
    });
    const subject = this.getCellById(TEST_SUBJECT_ID);
    if (subject) this.graph.setSelectionCell(subject);
    return { subjectId: TEST_SUBJECT_ID, targetId: TEST_TARGET_ID };
  }

  clearGestureTestFixture(): void {
    const cells = [
      this.getCellById(TEST_SUBJECT_ID),
      this.getCellById(TEST_TARGET_ID),
    ].filter((cell): cell is Cell => Boolean(cell));
    if (cells.length) this.graph.removeCells(cells, true);
  }

  getCellMetrics(id: string): CellMetrics | null {
    const geometry = this.getCellById(id)?.getGeometry();
    if (!geometry) return null;
    return {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
    };
  }

  getCellLabel(id: string): string | null {
    const cell = this.getCellById(id);
    return cell ? String(cell.getValue() ?? '') : null;
  }

  selectCellById(id: string): boolean {
    const cell = this.getCellById(id);
    if (!cell) return false;
    this.graph.setSelectionCell(cell);
    this.graph.scrollCellToVisible(cell);
    return true;
  }

  areCellsConnected(sourceId: string, targetId: string): boolean {
    const source = this.getCellById(sourceId);
    const target = this.getCellById(targetId);
    return Boolean(source && target && this.graph.getEdgesBetween(source, target, true).length);
  }

  isEditingCell(id: string): boolean {
    const cell = this.getCellById(id);
    return Boolean(cell && this.graph.isEditing() && this.graph.getSelectionCell() === cell);
  }

  stopEditing(cancel = false): void {
    if (this.graph.isEditing()) this.graph.stopEditing(cancel);
  }

  private getCellById(id: string): Cell | null {
    return this.graph.getDataModel().getCell(id) ?? null;
  }

  private getVertexAtClientPoint(position: PointerPosition): Cell | null {
    const bounds = this.container.getBoundingClientRect();
    const localX = position.x - bounds.left + this.container.scrollLeft;
    const localY = position.y - bounds.top + this.container.scrollTop;
    const cell = this.graph.getCellAt(localX, localY);
    return cell?.isVertex() ? cell : null;
  }

  private getPerimeterAnchor(
    cell: Cell,
    position: PointerPosition,
  ): { anchor: PerimeterAnchor; point: PointerPosition } | null {
    const state = this.graph.getView().getState(cell);
    if (!state || state.width <= 0 || state.height <= 0) return null;
    const bounds = this.container.getBoundingClientRect();
    const left = bounds.left + state.x - this.container.scrollLeft;
    const top = bounds.top + state.y - this.container.scrollTop;
    const anchor = snapToNearestPerimeter(
      (position.x - left) / state.width,
      (position.y - top) / state.height,
    );
    return {
      anchor,
      point: {
        x: left + state.width * anchor.x,
        y: top + state.height * anchor.y,
      },
    };
  }

  private getStoredSmartSourcePoint(): PointerPosition | null {
    const source = this.pendingSmartConnector;
    if (!source) return null;
    const state = this.graph.getView().getState(source.cell);
    if (!state) return null;
    const bounds = this.container.getBoundingClientRect();
    return {
      x: bounds.left + state.x + state.width * source.anchor.x - this.container.scrollLeft,
      y: bounds.top + state.y + state.height * source.anchor.y - this.container.scrollTop,
    };
  }

  private createSmartConnectorPreview(): void {
    this.removeSmartConnectorPreview();
    const line = document.createElement('div');
    const source = document.createElement('div');
    const target = document.createElement('div');
    line.className = 'smart-connector-preview__line';
    source.className = 'smart-connector-preview__point smart-connector-preview__point--source';
    target.className = 'smart-connector-preview__point smart-connector-preview__point--target';
    document.body.append(line, source, target);
    this.smartConnectorPreview = { line, source, target };
  }

  private updateSmartConnectorPreview(position: PointerPosition): void {
    const preview = this.smartConnectorPreview;
    const source = this.getStoredSmartSourcePoint();
    if (!preview || !source) return;
    const targetCell = this.getVertexAtClientPoint(position);
    const snapped = targetCell && targetCell !== this.pendingSmartConnector?.cell
      ? this.getPerimeterAnchor(targetCell, position)
      : null;
    const target = snapped?.point ?? position;
    const dx = target.x - source.x;
    const dy = target.y - source.y;

    preview.line.style.left = `${source.x}px`;
    preview.line.style.top = `${source.y}px`;
    preview.line.style.width = `${Math.hypot(dx, dy)}px`;
    preview.line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    preview.source.style.left = `${source.x}px`;
    preview.source.style.top = `${source.y}px`;
    preview.target.style.left = `${target.x}px`;
    preview.target.style.top = `${target.y}px`;
    preview.target.classList.toggle('is-snapped', Boolean(snapped));
  }

  private removeSmartConnectorPreview(): void {
    this.smartConnectorPreview?.line.remove();
    this.smartConnectorPreview?.source.remove();
    this.smartConnectorPreview?.target.remove();
    this.smartConnectorPreview = null;
  }

  private getAnchorClientPoint(cell: Cell, anchor: VoiceAnchor): PointerPosition | null {
    const state = this.graph.getView().getState(cell);
    if (!state) return null;
    const [x, y] = VOICE_ANCHORS[anchor];
    const bounds = this.container.getBoundingClientRect();
    return {
      x: bounds.left + state.x + state.width * x - this.container.scrollLeft,
      y: bounds.top + state.y + state.height * y - this.container.scrollTop,
    };
  }

  destroy(): void {
    this.resetLineGesture();
    this.cancelSmartConnector();
    this.container.removeEventListener('pointerdown', this.linePointerDown, true);
    document.removeEventListener('pointermove', this.linePointerMove, true);
    document.removeEventListener('pointerup', this.linePointerUp, true);
    this.container.removeEventListener('click', this.lineClick, true);
    this.graph.getDataModel().removeListener(this.undoListener);
    this.graph.getView().removeListener(this.undoListener);
    this.graph.getSelectionModel().removeListener(this.selectionListener);
    const view = this.graph.getView();
    view.removeListener(this.viewTransformListener);
    const panning = this.graph.getPlugin<PanningHandler>('PanningHandler');
    panning?.removeListener(this.panPreviewListener);
    panning?.removeListener(this.panEndListener);
    this.undoManager.destroy();
    this.graph.destroy();
  }
}
