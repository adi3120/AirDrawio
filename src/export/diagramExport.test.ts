import { Cell, Geometry, Point } from '@maxgraph/core';
import { describe, expect, it } from 'vitest';
import {
  createExportFileName,
  serializeDrawioFile,
  serializeDrawioStyle,
} from './diagramExport';

function createModel(): Cell {
  const root = new Cell();
  root.setId('0');
  const layer = new Cell();
  layer.setId('1');
  root.insert(layer);

  const source = new Cell('Web & API', new Geometry(20, 30, 180, 68), {
    rounded: true,
    fillColor: '#ffffff',
    endFill: false,
  });
  source.setId('source');
  source.setVertex(true);
  layer.insert(source);

  const target = new Cell('Database', new Geometry(360, 30, 180, 68), { shape: 'cylinder' });
  target.setId('target');
  target.setVertex(true);
  layer.insert(target);

  const edgeGeometry = new Geometry();
  edgeGeometry.relative = true;
  edgeGeometry.points = [new Point(280, 12)];
  const edge = new Cell('', edgeGeometry, { edgeStyle: 'orthogonalEdgeStyle', endArrow: 'block' });
  edge.setId('edge');
  edge.setEdge(true);
  edge.setTerminal(source, true);
  edge.setTerminal(target, false);
  layer.insert(edge);
  return root;
}

describe('diagram export', () => {
  it('converts object styles to diagrams.net style strings', () => {
    expect(serializeDrawioStyle({
      baseStyleNames: ['base'],
      rounded: true,
      endFill: false,
      strokeWidth: 2,
      fillColor: '#fff',
    })).toBe('base;rounded=1;endFill=0;strokeWidth=2;fillColor=#fff;');
  });

  it('writes an editable uncompressed draw.io document', () => {
    const xml = serializeDrawioFile(createModel(), new Date('2026-09-27T12:00:00.000Z'));
    const documentNode = new DOMParser().parseFromString(xml, 'application/xml');
    expect(documentNode.querySelector('parsererror')).toBeNull();
    expect(documentNode.documentElement.tagName).toBe('mxfile');
    expect(documentNode.documentElement.getAttribute('compressed')).toBe('false');
    expect(documentNode.querySelector('diagram')?.getAttribute('name')).toBe('Page-1');
    expect(documentNode.querySelector('mxGraphModel')?.getAttribute('page')).toBe('0');

    const source = documentNode.querySelector('mxCell[id="source"]');
    expect(source?.getAttribute('value')).toBe('Web & API');
    expect(source?.getAttribute('vertex')).toBe('1');
    expect(source?.getAttribute('style')).toContain('rounded=1');
    expect(source?.querySelector('mxGeometry')?.getAttribute('width')).toBe('180');

    const edge = documentNode.querySelector('mxCell[id="edge"]');
    expect(edge?.getAttribute('source')).toBe('source');
    expect(edge?.getAttribute('target')).toBe('target');
    expect(edge?.querySelector('mxGeometry')?.getAttribute('relative')).toBe('1');
    expect(edge?.querySelector('Array[as="points"] mxPoint')?.getAttribute('x')).toBe('280');
  });

  it('uses the expected file extensions', () => {
    const date = new Date('2026-09-27T12:34:56.789Z');
    expect(createExportFileName('drawio', date)).toMatch(/\.drawio$/);
    expect(createExportFileName('png', date)).toMatch(/\.png$/);
    expect(createExportFileName('jpeg', date)).toMatch(/\.jpeg$/);
  });
});
