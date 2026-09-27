import {
  ImageExport,
  SvgCanvas2D,
  type Graph,
} from '@maxgraph/core';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const EXPORT_PADDING = 24;
const MAX_RASTER_DIMENSION = 8192;

export interface SvgExport {
  svg: string;
  width: number;
  height: number;
}

export function createDiagramSvg(graph: Graph): SvgExport {
  graph.getView().validate();
  const bounds = graph.getGraphBounds();
  const scale = Math.max(0.01, graph.getView().getScale());
  const paddingInView = EXPORT_PADDING * scale;
  const viewWidth = Math.max(1, bounds.width + paddingInView * 2);
  const viewHeight = Math.max(1, bounds.height + paddingInView * 2);
  const width = Math.max(1, Math.ceil(viewWidth / scale));
  const height = Math.max(1, Math.ceil(viewHeight / scale));

  const documentNode = document.implementation.createDocument(SVG_NAMESPACE, 'svg', null);
  const root = documentNode.documentElement as unknown as SVGSVGElement;
  root.setAttribute('xmlns', SVG_NAMESPACE);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute(
    'viewBox',
    `${bounds.x - paddingInView} ${bounds.y - paddingInView} ${viewWidth} ${viewHeight}`,
  );
  root.setAttribute('version', '1.1');

  const background = documentNode.createElementNS(SVG_NAMESPACE, 'rect');
  background.setAttribute('x', String(bounds.x - paddingInView));
  background.setAttribute('y', String(bounds.y - paddingInView));
  background.setAttribute('width', String(viewWidth));
  background.setAttribute('height', String(viewHeight));
  background.setAttribute('fill', '#f8fafc');
  root.appendChild(background);

  const rootCell = graph.getDataModel().getRoot();
  const rootState = rootCell ? graph.getView().getState(rootCell) : null;
  if (!rootState) throw new Error('The diagram is not ready to export.');
  const canvas = new SvgCanvas2D(root, true);
  canvas.foEnabled = false;
  new ImageExport().drawState(rootState, canvas);

  return {
    svg: new XMLSerializer().serializeToString(root),
    width,
    height,
  };
}

export async function rasterizeDiagram(
  exported: SvgExport,
  format: 'png' | 'jpeg',
): Promise<Blob> {
  const multiplier = Math.min(
    2,
    MAX_RASTER_DIMENSION / Math.max(exported.width, exported.height),
  );
  const pixelWidth = Math.max(1, Math.round(exported.width * multiplier));
  const pixelHeight = Math.max(1, Math.round(exported.height * multiplier));
  const source = new Blob([exported.svg], { type: 'image/svg+xml;charset=utf-8' });
  const sourceUrl = URL.createObjectURL(source);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('The diagram image could not be rendered.'));
      nextImage.src = sourceUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas export is unavailable in this browser.');
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);

    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('The diagram image could not be encoded.')),
        mimeType,
        format === 'jpeg' ? 0.92 : undefined,
      );
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
