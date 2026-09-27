import { forwardRef } from 'react';
import type { GestureState } from '../gestures/gestureTypes';

interface VirtualCursorProps {
  visible: boolean;
  state: GestureState;
}

export const VirtualCursor = forwardRef<HTMLDivElement, VirtualCursorProps>(
  function VirtualCursor({ visible, state }, ref) {
    return (
      <div
        ref={ref}
        className={`virtual-cursor virtual-cursor--${state.toLowerCase()} ${
          visible ? 'is-visible' : ''
        }`}
        aria-hidden="true"
      >
        <span className="virtual-cursor__core" />
        <span className="virtual-cursor__ring" />
        <span className="virtual-cursor__label">
          {state === 'DRAWING' ? 'draw' : state === 'DRAGGING' ? 'drag' : state === 'PINCHED' ? 'pinch' : ''}
        </span>
      </div>
    );
  },
);
