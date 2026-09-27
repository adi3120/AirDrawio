# Development

## Commands

```bash
npm install        # install locked dependencies
npm run dev        # Vite development server
npm test           # voice, pointer, gesture, and coordinate unit tests
npm run build      # strict TypeScript check and production bundle
npm run preview    # preview the production bundle
```

## Browser requirements

Camera access requires `localhost` or HTTPS. Voice + Camera downloads the pinned MediaPipe WebAssembly runtime and hand model on first initialization. Commands are decoded locally with the bundled Vosk model and require microphone permission plus browser WebAssembly/Worker support.

## Testing without a webcam

Mouse, trackpad, and keyboard behavior is always available. Hands-free behavior is tested with command parsing, pointer events, and synthetic landmark sequences in Vitest:

- local voice phrase normalization, restricted grammar, and command mapping
- left/right click and hold button masks
- pinch detection and hysteresis
- palm normalization
- double-pinch timing
- drag transition
- low-confidence rejection
- hand disappearance
- coordinate mapping
- smoothing
- adaptive Air Pen thumb calibration, hysteresis, jitter tolerance, and stale-frame rejection
- hand-drawn shape classification and curve simplification

For manual testing, keep the camera preview visible. Test these flows in order:

1. Move the cursor with the index fingertip.
2. Point at a toolbar control and say “select.”
3. Point at a shape, say “hold,” move it, then say “release.”
4. Use the same hold/release flow on a resize handle.
5. Say “select top” on one shape and “select bottom” on another.
6. Point at a shape, say “rename,” dictate with Wispr, then say “done.”
7. Test left click, right click, left hold, and right hold.
8. Move out of frame during a drag; confirm the editor releases safely.
9. Switch to Mouse Mode and continue editing.

The same sequence is available as an instrumented in-app flow from **Test controls**. Its checks read camera/tracking state, cursor position, maxGraph cell geometry, graph terminals, dictation state, and label changes rather than relying only on user confirmation.

## Threshold tuning

Use the debug overlay to watch the pinch ratio with an open hand and during a comfortable pinch. A start threshold should sit above the steady pinched value and well below the open-hand value. The release threshold must remain higher than the start threshold.

Air Pen thumb closing uses a separate adaptive detector. Each `draw` command resets it; the user's comfortable open pose becomes the session baseline, and a meaningful relative thumb-to-palm decrease begins drawing. Keep this detector adaptive rather than replacing it with one fixed pixel or landmark threshold.

## Local voice model

`public/models/vosk-small-en-in.model` is a gzipped Vosk model archive deliberately stored without a `.gz` suffix. Adding the suffix makes some development servers advertise gzip content encoding and strip the archive layer before the Vosk worker receives it. Command phrases live in `voice/voiceCommandModel.ts`; keep the grammar narrow and include `[unk]` so unrelated speech is not forced into the nearest command.

## MediaPipe assets

`HandTracker.ts` pins the runtime to `@mediapipe/tasks-vision@1.0.1` and uses the official hosted float16 hand model. A production offline distribution should copy the package WebAssembly files and model into `public/`, then update the two asset URLs.

## Architectural constraints

Do not move the editor into a cross-origin iframe unless the gesture controller also moves into that iframe or a draw.io fork. Synthetic events cannot cross that boundary. Keep high-frequency landmarks out of React state; use controllers and refs, updating React only for status UI.
