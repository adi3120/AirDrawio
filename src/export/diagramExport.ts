import type { Cell, CellStyle } from '@maxgraph/core';

export type DiagramExportFormat = 'drawio' | 'png' | 'jpeg';

const STYLE_KEY_ALIASES: Record<string, string> = {
  autoSize: 'autosize',
};

function serializeStyleValue(value: unknown): string | null {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return null;
}

export function serializeDrawioStyle(style: CellStyle): string {
  const values: string[] = [];
  const baseStyles = style.baseStyleNames;
  if (Array.isArray(baseStyles)) {
    values.push(...baseStyles.filter((name): name is string => typeof name === 'string' && Boolean(name)));
  }

  for (const [key, rawValue] of Object.entries(style)) {
    if (key === 'baseStyleNames' || key === 'ignoreDefaultStyle' || rawValue == null) continue;
    const value = serializeStyleValue(rawValue);
    if (value !== null) values.push(`${STYLE_KEY_ALIASES[key] ?? key}=${value}`);
  }

  const body = values.length ? `${values.join(';')};` : '';
  return style.ignoreDefaultStyle ? `;${body}` : body;
}

function collectCells(root: Cell): Cell[] {
  const result: Cell[] = [];
  const visit = (cell: Cell) => {
    result.push(cell);
    for (let index = 0; index < cell.getChildCount(); index += 1) visit(cell.getChildAt(index));
  };
  visit(root);
  return result;
}

function appendPoint(
  documentNode: XMLDocument,
  geometryNode: Element,
  point: { x: number; y: number },
  role?: string,
): void {
  const pointNode = documentNode.createElement('mxPoint');
  pointNode.setAttribute('x', String(point.x));
  pointNode.setAttribute('y', String(point.y));
  if (role) pointNode.setAttribute('as', role);
  geometryNode.appendChild(pointNode);
}

/**
 * Serializes maxGraph's object-style model into the legacy mxGraph XML schema
 * consumed by diagrams.net. The diagram is intentionally uncompressed so the
 * downloaded file remains inspectable and portable.
 */
export function serializeDrawioFile(root: Cell, modified = new Date()): string {
  const documentNode = document.implementation.createDocument('', 'mxfile', null);
  const mxfile = documentNode.documentElement;
  mxfile.setAttribute('host', 'AirDrawio');
  mxfile.setAttribute('modified', modified.toISOString());
  mxfile.setAttribute('agent', navigator.userAgent || 'AirDrawio');
  mxfile.setAttribute('version', '1.0');
  mxfile.setAttribute('type', 'device');
  mxfile.setAttribute('compressed', 'false');

  const diagram = documentNode.createElement('diagram');
  diagram.setAttribute('id', 'airdrawio-page-1');
  diagram.setAttribute('name', 'Page-1');
  mxfile.appendChild(diagram);

  const model = documentNode.createElement('mxGraphModel');
  model.setAttribute('dx', '1200');
  model.setAttribute('dy', '800');
  model.setAttribute('grid', '1');
  model.setAttribute('gridSize', '16');
  model.setAttribute('guides', '1');
  model.setAttribute('tooltips', '1');
  model.setAttribute('connect', '1');
  model.setAttribute('arrows', '1');
  model.setAttribute('fold', '0');
  model.setAttribute('page', '0');
  model.setAttribute('pageScale', '1');
  model.setAttribute('math', '0');
  model.setAttribute('shadow', '0');
  diagram.appendChild(model);

  const xmlRoot = documentNode.createElement('root');
  model.appendChild(xmlRoot);

  const cells = collectCells(root);
  const ids = new Map<Cell, string>();
  cells.forEach((cell, index) => ids.set(cell, cell.getId() ?? String(index)));

  for (const cell of cells) {
    const cellNode = documentNode.createElement('mxCell');
    cellNode.setAttribute('id', ids.get(cell)!);
    const value = cell.getValue();
    if (value != null && value !== '') cellNode.setAttribute('value', String(value));
    const parent = cell.getParent();
    if (parent) cellNode.setAttribute('parent', ids.get(parent) ?? String(parent.getId() ?? '0'));
    const source = cell.getTerminal(true);
    const target = cell.getTerminal(false);
    if (source) cellNode.setAttribute('source', ids.get(source) ?? String(source.getId() ?? ''));
    if (target) cellNode.setAttribute('target', ids.get(target) ?? String(target.getId() ?? ''));
    if (cell.isVertex()) cellNode.setAttribute('vertex', '1');
    if (cell.isEdge()) cellNode.setAttribute('edge', '1');
    if (!cell.isConnectable()) cellNode.setAttribute('connectable', '0');
    if (!cell.isVisible()) cellNode.setAttribute('visible', '0');
    if (cell.isCollapsed()) cellNode.setAttribute('collapsed', '1');
    const style = serializeDrawioStyle(cell.getStyle());
    if (style) cellNode.setAttribute('style', style);

    const geometry = cell.getGeometry();
    if (geometry) {
      const geometryNode = documentNode.createElement('mxGeometry');
      geometryNode.setAttribute('x', String(geometry.x));
      geometryNode.setAttribute('y', String(geometry.y));
      geometryNode.setAttribute('width', String(geometry.width));
      geometryNode.setAttribute('height', String(geometry.height));
      geometryNode.setAttribute('as', 'geometry');
      if (geometry.relative) geometryNode.setAttribute('relative', '1');
      if (geometry.sourcePoint) appendPoint(documentNode, geometryNode, geometry.sourcePoint, 'sourcePoint');
      if (geometry.targetPoint) appendPoint(documentNode, geometryNode, geometry.targetPoint, 'targetPoint');
      if (geometry.offset) appendPoint(documentNode, geometryNode, geometry.offset, 'offset');
      if (geometry.points?.length) {
        const pointsNode = documentNode.createElement('Array');
        pointsNode.setAttribute('as', 'points');
        for (const point of geometry.points) appendPoint(documentNode, pointsNode, point);
        geometryNode.appendChild(pointsNode);
      }
      if (geometry.alternateBounds) {
        const alternate = documentNode.createElement('mxRectangle');
        alternate.setAttribute('x', String(geometry.alternateBounds.x));
        alternate.setAttribute('y', String(geometry.alternateBounds.y));
        alternate.setAttribute('width', String(geometry.alternateBounds.width));
        alternate.setAttribute('height', String(geometry.alternateBounds.height));
        alternate.setAttribute('as', 'alternateBounds');
        geometryNode.appendChild(alternate);
      }
      cellNode.appendChild(geometryNode);
    }

    xmlRoot.appendChild(cellNode);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(mxfile)}`;
}

export function createExportFileName(format: DiagramExportFormat, date = new Date()): string {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `airdrawio-${timestamp}.${format}`;
}
