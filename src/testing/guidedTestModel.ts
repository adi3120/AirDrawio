import type { PointerPosition } from '../gestures/gestureTypes';
import type { CellMetrics } from '../drawio/DrawioController';

export type GuidedTestId =
  | 'tracking'
  | 'cursor'
  | 'pinch'
  | 'drag'
  | 'resize'
  | 'connector'
  | 'text'
  | 'voice'
  | 'mouse';

export type GuidedTestStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface GuidedTestStep {
  id: GuidedTestId;
  title: string;
  instruction: string;
  watching: string;
  help: string[];
}

export const GUIDED_TEST_STEPS: GuidedTestStep[] = [
  {
    id: 'tracking',
    title: 'Find your hand',
    instruction: 'Hold one open hand in the camera frame until the status changes to Hand detected.',
    watching: 'Camera active + a confident hand frame',
    help: [
      'Face your palm toward the camera, about 45–70 cm away.',
      'Keep your whole hand inside the preview, with your fingers separated.',
      'Move away from strong backlighting and make sure your hand is well lit.',
    ],
  },
  {
    id: 'cursor',
    title: 'Aim the cursor',
    instruction: 'Point with your index finger and move the glowing cursor into the cyan checkpoint.',
    watching: 'Virtual cursor enters the checkpoint',
    help: [
      'Move your hand slowly; the camera is mirrored like a selfie view.',
      'No hand pose is required—the camera only follows your index fingertip.',
      'If it feels too slow, increase Sensitivity after the test.',
    ],
  },
  {
    id: 'pinch',
    title: 'Say select to click',
    instruction: 'Keep the cursor over the cyan checkpoint and say “select.”',
    watching: 'A voice-triggered click occurs inside the checkpoint',
    help: [
      'Wait until the Voice status says Listening.',
      'Keep the fingertip cursor inside the checkpoint while speaking.',
      'Say only the word “select” and pause briefly.',
    ],
  },
  {
    id: 'drag',
    title: 'Move a shape',
    instruction: 'Point at “Gesture test block,” say “hold,” move it at least four grid dots, then say “release.”',
    watching: 'The test block moves at least 60 canvas pixels',
    help: [
      'Aim at the center of the turquoise test block—not its border or handle.',
      'Say “hold,” wait until the cursor says drag, then move your hand.',
      'Keep your hand steady and say “release” to drop the shape.',
    ],
  },
  {
    id: 'resize',
    title: 'Resize a shape',
    instruction: 'Point at the bottom-right resize handle, say “hold,” pull outward, then say “release.”',
    watching: 'Width or height changes by at least 18 canvas pixels',
    help: [
      'The block is selected; look for the small handle at its bottom-right corner.',
      'Aim carefully, say “hold,” then move diagonally down and right.',
      'If the shape moves instead, say “release,” reselect it, and aim closer to the corner handle.',
    ],
  },
  {
    id: 'connector',
    title: 'Connect two shapes',
    instruction: 'Point at the source and say “select top.” Point at the target and say “select bottom.”',
    watching: 'A persistent graph edge connects the two test cells',
    help: [
      'The first side command latches a visible source point.',
      'Move to the green target without holding a mouse button.',
      'Say “select bottom” to attach the destination point.',
    ],
  },
  {
    id: 'text',
    title: 'Open voice text editing',
    instruction: 'Aim at the turquoise test block and say “edit text.”',
    watching: 'Voice dictation mode becomes active',
    help: [
      'Keep the cursor still over the center of the shape.',
      'Say the two words “edit text” and pause.',
      'The dictation banner should ask you to say “right shift” when finished.',
    ],
  },
  {
    id: 'voice',
    title: 'Set a voice label',
    instruction: 'While dictation is active, clearly say “Gesture verified,” then say “right shift.”',
    watching: 'The selected test block receives a new label',
    help: [
      'The turquoise test block is selected automatically.',
      'If dictation closed, point at the block and say “edit text” again.',
      'Say the label, pause for it to appear, then say “right shift.”',
    ],
  },
  {
    id: 'mouse',
    title: 'Return to mouse input',
    instruction: 'Point at Mouse in the mode switch and say “select.”',
    watching: 'Gesture Mode stops and Mouse Mode becomes active',
    help: [
      'Point near the top-center Mouse button.',
      'Say “select” once; the camera and microphone should stop immediately.',
      'Afterward, click or drag any shape normally with your mouse or trackpad.',
    ],
  },
];

export function isPointInside(
  point: PointerPosition | null,
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'> | null,
  inset = 0,
): boolean {
  if (!point || !rect) return false;
  return (
    point.x >= rect.left + inset &&
    point.x <= rect.right - inset &&
    point.y >= rect.top + inset &&
    point.y <= rect.bottom - inset
  );
}

export function hasMoved(
  current: CellMetrics | null,
  baseline: CellMetrics | null,
  threshold = 60,
): boolean {
  if (!current || !baseline) return false;
  return Math.hypot(current.x - baseline.x, current.y - baseline.y) >= threshold;
}

export function hasResized(
  current: CellMetrics | null,
  baseline: CellMetrics | null,
  threshold = 18,
): boolean {
  if (!current || !baseline) return false;
  return (
    Math.abs(current.width - baseline.width) >= threshold ||
    Math.abs(current.height - baseline.height) >= threshold
  );
}
