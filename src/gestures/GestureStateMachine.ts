import type {
  GestureEvent,
  GestureInput,
  GestureState,
  PointerPosition,
} from './gestureTypes';
import { DoublePinchDetector } from './DoublePinchDetector';

const distance = (a: PointerPosition, b: PointerPosition) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export class GestureStateMachine {
  private state: GestureState = 'IDLE';
  private pinchOrigin: PointerPosition | null = null;
  private lastPosition: PointerPosition | null = null;

  constructor(
    private readonly doublePinch = new DoublePinchDetector(),
    private dragThresholdPx = 8,
  ) {}

  update(input: GestureInput): GestureEvent[] {
    const events: GestureEvent[] = [];
    this.lastPosition = input.position;

    if (this.state === 'IDLE') this.state = 'HOVERING';

    if (input.pinchPhase === 'started') {
      const isDouble = this.doublePinch.registerPinchStart(input.timestamp);
      this.pinchOrigin = input.position;
      this.state = 'PINCHED';
      events.push(
        isDouble
          ? { type: 'DOUBLE_PINCH', position: input.position }
          : { type: 'PINCH_START', position: input.position },
      );
      return events;
    }

    if (input.pinchPhase === 'held' && this.pinchOrigin) {
      if (
        this.state === 'PINCHED' &&
        distance(input.position, this.pinchOrigin) >= this.dragThresholdPx
      ) {
        this.state = 'DRAGGING';
        events.push({ type: 'DRAG_START', position: input.position });
      } else if (this.state === 'DRAGGING') {
        events.push({ type: 'DRAG_MOVE', position: input.position });
      }
      return events;
    }

    if (input.pinchPhase === 'ended') {
      const wasDrag = this.state === 'DRAGGING';
      this.doublePinch.registerPinchEnd(input.timestamp);
      this.pinchOrigin = null;
      this.state = 'HOVERING';
      events.push({
        type: 'PINCH_END',
        position: input.position,
        wasDrag,
      });
      return events;
    }

    if (this.state === 'HOVERING') {
      events.push({ type: 'MOVE', position: input.position });
    }
    return events;
  }

  handLost(): GestureEvent[] {
    const events: GestureEvent[] = [
      { type: 'HAND_LOST', position: this.lastPosition },
    ];
    this.state = 'IDLE';
    this.pinchOrigin = null;
    this.lastPosition = null;
    this.doublePinch.reset();
    return events;
  }

  getState(): GestureState {
    return this.state;
  }

  setDoublePinchInterval(intervalMs: number): void {
    this.doublePinch.setInterval(intervalMs);
  }
}
