import type { GestureEvent, GestureState, PointerPosition } from '../gestures/gestureTypes';
import { PointerEventBridge, type PointerButton } from '../drawio/PointerEventBridge';

export class CursorController {
  private position: PointerPosition | null = null;
  private state: GestureState = 'IDLE';

  constructor(
    private readonly element: HTMLElement,
    private readonly bridge: PointerEventBridge,
    private readonly onState?: (state: GestureState) => void,
    private readonly onAction?: (event: GestureEvent) => void,
  ) {}

  apply(event: GestureEvent): void {
    this.onAction?.(event);
    if ('position' in event && event.position) {
      this.position = event.position;
      this.paint(event.position);
    }

    switch (event.type) {
      case 'MOVE':
        this.setState('HOVERING');
        this.bridge.move(event.position);
        break;
      case 'PINCH_START':
        this.setState('PINCHED');
        this.bridge.down(event.position);
        break;
      case 'DRAG_START':
      case 'DRAG_MOVE':
        this.setState('DRAGGING');
        this.bridge.move(event.position);
        break;
      case 'PINCH_END':
        this.bridge.up(event.position, !event.wasDrag);
        this.setState('HOVERING');
        break;
      case 'DOUBLE_PINCH':
        this.bridge.cancel();
        this.bridge.doubleClick(event.position);
        this.setState('TEXT_EDIT');
        break;
      case 'HAND_LOST':
        this.bridge.cancel();
        this.setState('IDLE');
        break;
    }
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('is-visible', visible);
  }

  voiceMove(position: PointerPosition): void {
    this.position = position;
    this.paint(position);
    this.bridge.move(position);
    if (this.bridge.isPressed()) {
      this.onAction?.({ type: 'DRAG_MOVE', position });
      this.setState('DRAGGING');
    } else {
      this.onAction?.({ type: 'MOVE', position });
      this.setState('HOVERING');
    }
  }

  voiceClick(position: PointerPosition, button: PointerButton = 'left'): void {
    this.position = position;
    this.paint(position);
    this.onAction?.({ type: 'PINCH_START', position });
    this.bridge.click(position, button);
    this.onAction?.({ type: 'PINCH_END', position, wasDrag: false });
    this.setState('HOVERING');
  }

  voicePress(position: PointerPosition, button: PointerButton = 'left'): void {
    this.position = position;
    this.paint(position);
    this.onAction?.({ type: 'PINCH_START', position });
    this.bridge.down(position, button);
    this.setState('DRAGGING');
  }

  voiceRelease(position: PointerPosition): void {
    this.position = position;
    this.paint(position);
    this.bridge.up(position, false);
    this.onAction?.({ type: 'PINCH_END', position, wasDrag: true });
    this.setState('HOVERING');
  }

  voiceDoubleClick(position: PointerPosition): void {
    this.position = position;
    this.paint(position);
    this.bridge.doubleClick(position);
    this.setState('TEXT_EDIT');
  }

  private paint(position: PointerPosition): void {
    this.element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
  }

  private setState(state: GestureState): void {
    if (state === this.state) return;
    this.element.classList.remove(`virtual-cursor--${this.state.toLowerCase()}`);
    this.element.classList.add(`virtual-cursor--${state.toLowerCase()}`);
    const label = this.element.querySelector<HTMLElement>('.virtual-cursor__label');
    if (label) label.textContent = state === 'DRAGGING' ? 'drag' : state === 'PINCHED' ? 'pinch' : '';
    this.state = state;
    this.onState?.(state);
  }
}
