import type { PointerPosition } from '../gestures/gestureTypes';

export interface PointerBridgeOptions {
  compatibilityMouseEvents: boolean;
}

export type PointerButton = 'left' | 'right';

/**
 * Converts gesture semantics into DOM pointer input. maxGraph still listens to a
 * small set of mouse compatibility events internally, so those are emitted after
 * each PointerEvent. The gesture layer itself remains pointer-event-first.
 */
export class PointerEventBridge {
  private pressedButton: 0 | 2 | null = null;
  private downTarget: Element | null = null;
  private lastPosition: PointerPosition | null = null;
  private readonly pointerId = 41;

  constructor(
    private readonly options: PointerBridgeOptions = {
      compatibilityMouseEvents: true,
    },
  ) {}

  move(position: PointerPosition): void {
    this.lastPosition = position;
    const target = this.findTarget(position);
    if (!target) return;
    this.dispatch(target, 'pointermove', position, this.pressedButton ?? 0, this.pressedButton !== null, false);
    if (this.options.compatibilityMouseEvents) {
      this.dispatchMouse(target, 'mousemove', position, this.pressedButton ?? 0, this.pressedButton !== null, false);
    }
  }

  down(position: PointerPosition, button: PointerButton = 'left'): void {
    this.lastPosition = position;
    const target = this.findTarget(position);
    if (!target) return;
    const buttonCode = button === 'right' ? 2 : 0;
    if (this.pressedButton !== null) this.cancel();
    this.pressedButton = buttonCode;
    this.downTarget = target;
    this.dispatch(target, 'pointerdown', position, buttonCode, true, true);
    if (this.options.compatibilityMouseEvents) {
      this.dispatchMouse(target, 'mousedown', position, buttonCode, true, true);
    }
  }

  up(position: PointerPosition, click = true): void {
    this.lastPosition = position;
    const target = this.findTarget(position) ?? this.downTarget;
    const buttonCode = this.pressedButton ?? 0;
    if (!target) {
      this.pressedButton = null;
      this.downTarget = null;
      return;
    }

    this.dispatch(target, 'pointerup', position, buttonCode, false, true);
    if (this.options.compatibilityMouseEvents) {
      this.dispatchMouse(target, 'mouseup', position, buttonCode, false, true);
    }
    if (click && this.downTarget && this.sameInteractiveTarget(this.downTarget, target)) {
      const type = buttonCode === 2 ? 'contextmenu' : 'click';
      target.dispatchEvent(new MouseEvent(type, this.mouseInit(position, buttonCode, false, 1)));
    }
    this.pressedButton = null;
    this.downTarget = null;
  }

  click(position: PointerPosition, button: PointerButton = 'left'): void {
    this.down(position, button);
    this.up(position, true);
  }

  doubleClick(position: PointerPosition): void {
    const target = this.findTarget(position);
    if (!target) return;
    target.dispatchEvent(
      new MouseEvent('dblclick', this.mouseInit(position, 0, false, 2)),
    );
  }

  cancel(): void {
    if (this.pressedButton !== null && this.lastPosition) {
      this.up(this.lastPosition, false);
    }
    this.pressedButton = null;
    this.downTarget = null;
  }

  isPressed(): boolean {
    return this.pressedButton !== null;
  }

  getPressedButton(): PointerButton | null {
    if (this.pressedButton === null) return null;
    return this.pressedButton === 2 ? 'right' : 'left';
  }

  private findTarget(position: PointerPosition): Element | null {
    return document.elementFromPoint(position.x, position.y);
  }

  private dispatch(
    target: Element,
    type: string,
    position: PointerPosition,
    button: 0 | 2,
    pressed: boolean,
    changedButton: boolean,
  ): void {
    target.dispatchEvent(
      new PointerEvent(type, {
        ...this.mouseInit(position, button, pressed, 1, changedButton),
        pointerId: this.pointerId,
        pointerType: 'pen',
        isPrimary: true,
        pressure: pressed ? 0.5 : 0,
      }),
    );
  }

  private dispatchMouse(
    target: Element,
    type: string,
    position: PointerPosition,
    button: 0 | 2,
    pressed: boolean,
    changedButton: boolean,
  ): void {
    target.dispatchEvent(
      new MouseEvent(type, this.mouseInit(position, button, pressed, 1, changedButton)),
    );
  }

  private mouseInit(
    position: PointerPosition,
    button: 0 | 2,
    pressed: boolean,
    detail: number,
    changedButton = true,
  ): MouseEventInit {
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: position.x,
      clientY: position.y,
      screenX: position.x,
      screenY: position.y,
      button: changedButton ? button : 0,
      buttons: pressed ? (button === 2 ? 2 : 1) : 0,
      detail,
    };
  }

  private sameInteractiveTarget(a: Element, b: Element): boolean {
    if (a === b || a.contains(b) || b.contains(a)) return true;
    const interactive = 'button, [role="button"], [data-cell-id]';
    return a.closest(interactive) === b.closest(interactive);
  }
}
