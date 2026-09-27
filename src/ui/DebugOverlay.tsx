import type { GestureState } from '../gestures/gestureTypes';
import type { TrackingSnapshot } from '../tracking/handTypes';

interface DebugOverlayProps {
  visible: boolean;
  snapshot: TrackingSnapshot;
  gesture: GestureState;
  pointer: { x: number; y: number } | null;
}

const coord = (value: number | undefined) => value === undefined ? '—' : value.toFixed(3);

export function DebugOverlay({ visible, snapshot, gesture, pointer }: DebugOverlayProps) {
  if (!visible) return null;
  return (
    <section className="debug-overlay" aria-label="Gesture debug data">
      <header><span>DEBUG</span><i className={snapshot.handDetected ? 'is-live' : ''} /></header>
      <dl>
        <dt>Index</dt><dd>{coord(snapshot.index?.x)}, {coord(snapshot.index?.y)}</dd>
        <dt>Thumb</dt><dd>{coord(snapshot.thumb?.x)}, {coord(snapshot.thumb?.y)}</dd>
        <dt>Pinch</dt><dd>{snapshot.pinchRatio?.toFixed(3) ?? '—'}</dd>
        <dt>2D / 3D</dt><dd>{snapshot.pinchImageRatio?.toFixed(2) ?? '—'} / {snapshot.pinchWorldRatio?.toFixed(2) ?? '—'}</dd>
        <dt>Source</dt><dd>{snapshot.pinchSource ?? '—'}</dd>
        <dt>Gesture</dt><dd className="debug-accent">{gesture}</dd>
        <dt>Pointer</dt><dd>{pointer ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}` : '—'}</dd>
        <dt>Tracking</dt><dd>{snapshot.fps} fps</dd>
        <dt>Confidence</dt><dd>{snapshot.confidence.toFixed(3)}</dd>
      </dl>
    </section>
  );
}
