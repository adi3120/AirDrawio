# Progress

## Completed

- Chose direct same-origin maxGraph integration after evaluating the diagrams.net iframe boundary.
- Scaffolded a strict TypeScript + React + Vite application.
- Added the maxGraph canvas with native selection, movement, resize, connection, editing, and undo model.
- Added camera capture and MediaPipe Hand Landmarker integration.
- Added cursor mapping, velocity-sensitive smoothing, orientation-independent 3D pinch measurement, hysteresis, double-pinch, state transitions, and hand-loss safety.
- Added virtual cursor, camera skeleton preview, live status, calibration controls, and debug overlay.
- Added gesture-friendly toolbar, semantic connector fallback, pan mode, and voice labels.
- Added browser-local Vosk command recognition with select, left/right click, hold/release, tools, shapes, history, clipboard, delete, Air Pen, and zoom commands.
- Added a top-right live microphone visualizer with waveform, frequency spectrum, input level, recognition state, and last-heard phrase.
- Added shape-only marquee multi-selection, native group dragging, group deletion, and straight-line press-drag-release drawing.
- Added exact top/bottom/left/right voice connector anchors with a visible latched-source marker.
- Added an optional native macOS bridge that maps “Rename” and “Done” to Wispr Flow's Fn hotkeys while editing the real inline label field.
- Added Air Pen drawing with adaptive thumb calibration plus automatic rectangle, ellipse, line, connector, text, and smoothed-curve cleanup.
- Added editable uncompressed Draw.io export plus tightly cropped high-resolution PNG and JPEG downloads.
- Replaced finite scroll boundaries with translation-based infinite canvas panning and a synchronized grid/ruler background.
- Added synthetic gesture, smoothing, and coordinate tests.
- Added README and architecture, gesture model, and development documentation.
- Added automated coverage for local voice decoding, Air Pen calibration/hysteresis, drawing recognition, gesture zoom, clipboard behavior, and connector geometry.
- Verified the live editor renders, adds shapes, updates selection, undoes changes, starts Gesture Mode, reports an active camera, and returns safely to Mouse Mode.
- Added a nine-step guided voice-and-camera test with temporary fixtures, automatic state verification, exact coaching, explicit failure recording, retry/summary states, and cleanup.
- Added guided-test movement, resize, and checkpoint verification coverage.
- Moved the live camera preview to the top-right and kept the guided-test panel clear of it.
- Added a ten-capture personal pinch trainer with robust threshold learning, local persistence, retraining, reset, and privacy copy.
- Added separate 2D/3D debug measurements and side-on/false-overlap detector tests.

## Currently working

- Voice + Camera is the default hands-free interaction; Air Pen and local commands are active, while pinch actions remain an optional fallback.

## Known issues

- MediaPipe runtime/model assets are hosted and require network access on first Gesture Mode start.
- Native connection handles are small; the two-selection Connector tool is the reliable gesture fallback.
- The optional Wispr bridge is macOS-only and depends on Accessibility permission for the terminal process that launches Vite.

## Next milestone

- Bundle the MediaPipe assets and add recorded voice/camera replay tests.

## Architectural decisions

- Use maxGraph directly instead of a cross-origin diagrams.net iframe so gesture input can reach the editor DOM.
- Keep pointer events as the public input abstraction; emit mouse compatibility events because maxGraph still uses them in parts of its interaction stack.
- Keep tracking data in controller objects/refs and throttle React status updates.
- Use explicit Pan and Connector modes where pose recognition or tiny handles would reduce reliability.
