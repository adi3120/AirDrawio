import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PointerEventBridge } from './PointerEventBridge';

describe('PointerEventBridge', () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    button = document.createElement('button');
    document.body.replaceChildren(button);
    if (!window.PointerEvent) {
      Object.defineProperty(window, 'PointerEvent', { value: MouseEvent, configurable: true });
    }
    Object.defineProperty(document, 'elementFromPoint', {
      value: vi.fn(() => button),
      configurable: true,
    });
  });

  it('maps a pinch click to pointer-first input and one compatibility click', () => {
    const received: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      button.addEventListener(type, () => received.push(type));
    }

    const bridge = new PointerEventBridge();
    bridge.down({ x: 20, y: 30 });
    bridge.up({ x: 20, y: 30 }, true);

    expect(received).toEqual([
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'click',
    ]);
    expect(bridge.isPressed()).toBe(false);
  });

  it('forces a pointer release without a click when input is cancelled', () => {
    const received: string[] = [];
    button.addEventListener('pointerup', () => received.push('pointerup'));
    button.addEventListener('click', () => received.push('click'));

    const bridge = new PointerEventBridge();
    bridge.down({ x: 20, y: 30 });
    bridge.cancel();

    expect(received).toEqual(['pointerup']);
    expect(bridge.isPressed()).toBe(false);
  });

  it('dispatches a right-button click as a context-menu sequence', () => {
    const received: Array<[string, number, number]> = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'contextmenu']) {
      button.addEventListener(type, (event) => {
        const mouse = event as MouseEvent;
        received.push([type, mouse.button, mouse.buttons]);
      });
    }

    const bridge = new PointerEventBridge();
    bridge.click({ x: 20, y: 30 }, 'right');

    expect(received.map(([type]) => type)).toEqual([
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'contextmenu',
    ]);
    expect(received[0]).toEqual(['pointerdown', 2, 2]);
    expect(received.at(-1)).toEqual(['contextmenu', 2, 0]);
  });

  it('keeps the chosen button pressed while voice-controlled movement continues', () => {
    const moves: number[] = [];
    button.addEventListener('mousemove', (event) => moves.push(event.buttons));

    const bridge = new PointerEventBridge();
    bridge.down({ x: 20, y: 30 }, 'right');
    bridge.move({ x: 40, y: 50 });

    expect(bridge.getPressedButton()).toBe('right');
    expect(moves).toEqual([2]);
    bridge.up({ x: 40, y: 50 }, false);
    expect(bridge.isPressed()).toBe(false);
  });
});
