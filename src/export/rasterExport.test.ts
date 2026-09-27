import { Graph } from '@maxgraph/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createDiagramSvg } from './rasterExport';

describe('raster export SVG source', () => {
  let graph: Graph | null = null;

  afterEach(() => {
    graph?.destroy();
    graph = null;
    document.body.replaceChildren();
  });

  it('creates a tightly cropped SVG containing diagram labels', () => {
    const container = document.createElement('div');
    Object.defineProperties(container, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
      offsetWidth: { value: 800 },
      offsetHeight: { value: 600 },
    });
    document.body.appendChild(container);
    graph = new Graph(container);
    graph.insertVertex({
      parent: graph.getDefaultParent(),
      value: 'Export me',
      position: [100, 80],
      size: [180, 68],
      style: { rounded: true, fillColor: '#ffffff', strokeColor: '#0f766e' },
    });

    const exported = createDiagramSvg(graph);
    expect(exported.width).toBeGreaterThan(180);
    expect(exported.height).toBeGreaterThan(68);
    expect(exported.svg).toContain('<svg');
    expect(exported.svg).toContain('Export me');
    expect(exported.svg).toContain('#f8fafc');
  });
});
