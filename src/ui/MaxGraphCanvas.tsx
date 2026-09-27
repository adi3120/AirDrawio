import { useEffect, useRef } from 'react';
import '@maxgraph/core/css/common.css';
import { DrawioController } from '../drawio/DrawioController';
import { Icon } from './Icon';

interface MaxGraphCanvasProps {
  onReady(controller: DrawioController): void;
  onSelectionChange(label: string | null): void;
  onNotice(message: string): void;
}

export function MaxGraphCanvas({
  onReady,
  onSelectionChange,
  onNotice,
}: MaxGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const controller = new DrawioController(containerRef.current, {
      onSelectionChange: (cell, count) =>
        onSelectionChange(count > 1 ? `${count} objects selected` : cell ? String(cell.getValue() ?? 'Untitled') : null),
      onNotice,
    });
    onReady(controller);
    return () => controller.destroy();
  }, [onNotice, onReady, onSelectionChange]);

  return (
    <div className="canvas-shell" aria-label="Diagram canvas">
      <div className="canvas-rulers canvas-rulers--x" aria-hidden="true" />
      <div className="canvas-rulers canvas-rulers--y" aria-hidden="true" />
      <div ref={containerRef} className="graph-canvas" tabIndex={0} />
      <div className="canvas-corner" aria-hidden="true" />
      <div className="canvas-infinite-hint"><Icon name="hand" /> Infinite canvas · use Pan to explore</div>
    </div>
  );
}
