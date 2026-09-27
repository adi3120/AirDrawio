import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CameraManager } from './camera/CameraManager';
import type { CameraStatus } from './camera/cameraTypes';
import { CoordinateMapper } from './cursor/CoordinateMapper';
import { CursorController } from './cursor/CursorController';
import { VirtualCursor } from './cursor/VirtualCursor';
import type { DiagramTool, ShapeKind } from './drawio/DrawioBridge';
import type { DrawioController } from './drawio/DrawioController';
import { PointerEventBridge } from './drawio/PointerEventBridge';
import { GestureEngine } from './gestures/GestureEngine';
import {
  clearGestureProfile,
  loadGestureProfile,
  saveGestureProfile,
  type GestureProfile,
} from './gestures/GestureProfile';
import { calculatePinchMeasurement, DEFAULT_PINCH_CONFIG } from './gestures/PinchDetector';
import { ZoomGestureDetector, type ZoomGesturePhase } from './gestures/ZoomGestureDetector';
import { ThumbDrawDetector } from './drawing/ThumbDrawDetector';
import type { GestureState, PointerPosition } from './gestures/gestureTypes';
import type { HandTracker } from './tracking/HandTracker';
import { LandmarkSmoother } from './tracking/LandmarkSmoother';
import type { TrackingSnapshot } from './tracking/handTypes';
import { CameraPreview, type CameraPreviewHandle } from './ui/CameraPreview';
import { DebugOverlay } from './ui/DebugOverlay';
import { GestureToolbar } from './ui/GestureToolbar';
import { GestureTrainer } from './ui/GestureTrainer';
import { GuidedTestFlow, type GestureActionSignal } from './ui/GuidedTestFlow';
import { Icon } from './ui/Icon';
import { MaxGraphCanvas } from './ui/MaxGraphCanvas';
import { SettingsPanel, type GestureSettings } from './ui/SettingsPanel';
import { StatusPanel } from './ui/StatusPanel';
import { VoiceTextController } from './voice/VoiceTextController';
import {
  VoiceCommandController,
  type VoiceRecognitionStatus,
} from './voice/VoiceCommandController';
import type { VoiceCommand } from './voice/voiceCommandModel';
import {
  VoiceInputMonitor,
  type VoiceInputStatus,
} from './voice/VoiceInputMonitor';
import type { VoiceAnchor } from './drawio/DrawioController';
import { VoiceGraphVisualizer } from './ui/VoiceGraphVisualizer';
import {
  openAccessibilitySettings,
  triggerWisprHotkey,
  WisprBridgeError,
} from './native/WisprBridge';

type InputMode = 'mouse' | 'gesture';
type AirDrawPhase = 'off' | 'armed' | 'drawing';

const initialSettings: GestureSettings = {
  sensitivity: 1.25,
  smoothing: 0.2,
  pinchThreshold: DEFAULT_PINCH_CONFIG.startThreshold,
  doublePinchMs: 400,
  confidenceThreshold: 0.6,
  mirrorX: true,
  showPreview: true,
  showDebug: false,
  voiceCommands: true,
  pinchActions: false,
};

const emptyTracking: TrackingSnapshot = {
  handDetected: false,
  confidence: 0,
  fps: 0,
  index: null,
  thumb: null,
  pinchRatio: null,
  pinchImageRatio: null,
  pinchWorldRatio: null,
  pinchSource: null,
};

export default function App() {
  const [controller, setController] = useState<DrawioController | null>(null);
  const [mode, setMode] = useState<InputMode>('mouse');
  const [activeTool, setActiveTool] = useState<DiagramTool>('pointer');
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [gestureState, setGestureState] = useState<GestureState>('IDLE');
  const [tracking, setTracking] = useState<TrackingSnapshot>(emptyTracking);
  const [pointer, setPointer] = useState<PointerPosition | null>(null);
  const [gestureProfile, setGestureProfile] = useState<GestureProfile | null>(() => loadGestureProfile());
  const [settings, setSettings] = useState<GestureSettings>(() => ({
    ...initialSettings,
    pinchThreshold: loadGestureProfile()?.pinch.threshold ?? initialSettings.pinchThreshold,
  }));
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState('Enable Voice + Camera: point with your finger, then say “select” or “hold.”');
  const [listening, setListening] = useState(false);
  const [voiceCommandListening, setVoiceCommandListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceRecognitionStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceInputStatus, setVoiceInputStatus] = useState<VoiceInputStatus>('idle');
  const [voiceAnalyser, setVoiceAnalyser] = useState<AnalyserNode | null>(null);
  const [voiceDeviceLabel, setVoiceDeviceLabel] = useState('');
  const [dictationMode, setDictationMode] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [wisprSetup, setWisprSetup] = useState<{ message: string; executable?: string } | null>(null);
  const [lastVoicePhrase, setLastVoicePhrase] = useState('');
  const [anchorMarker, setAnchorMarker] = useState<{ point: PointerPosition; anchor: VoiceAnchor } | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [lastGestureAction, setLastGestureAction] = useState<GestureActionSignal | null>(null);
  const [zoomMode, setZoomMode] = useState(false);
  const [zoomPhase, setZoomPhase] = useState<ZoomGesturePhase>('ready');
  const [airDrawPhase, setAirDrawPhase] = useState<AirDrawPhase>('off');
  const [airStroke, setAirStroke] = useState<PointerPosition[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<CameraPreviewHandle>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const animationRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const noticeTimerRef = useRef<number | null>(null);
  const voiceRef = useRef<VoiceTextController | null>(null);
  const voiceCommandRef = useRef<VoiceCommandController | null>(null);
  const voiceInputRef = useRef<VoiceInputMonitor | null>(null);
  const voiceCommandHandlerRef = useRef<(command: VoiceCommand) => void>(() => undefined);
  const dictationHandlerRef = useRef<(transcript: string) => void>(() => undefined);
  const pointerRef = useRef<PointerPosition | null>(null);
  const dictationBufferRef = useRef('');
  const wisprTransitionRef = useRef(false);
  const renamingRef = useRef(false);
  const zoomModeRef = useRef(false);
  const zoomPhaseRef = useRef<ZoomGesturePhase>('ready');
  const airDrawPhaseRef = useRef<AirDrawPhase>('off');
  const airStrokeRef = useRef<PointerPosition[]>([]);
  const settingsRef = useRef(settings);

  const mapperRef = useRef(new CoordinateMapper());
  const smootherRef = useRef(new LandmarkSmoother());
  const gestureEngineRef = useRef(new GestureEngine());
  const zoomGestureRef = useRef(new ZoomGestureDetector());
  const thumbDrawDetectorRef = useRef(new ThumbDrawDetector());
  const pointerBridgeRef = useRef(new PointerEventBridge());
  const cursorControllerRef = useRef<CursorController | null>(null);

  renamingRef.current = renaming;

  const announce = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice('Ready'), 4200);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    mapperRef.current.setConfig({
      mirrorX: settings.mirrorX,
      sensitivity: settings.sensitivity,
    });
    smootherRef.current.setConfig({
      slowAlpha: settings.smoothing,
      fastAlpha: Math.min(0.78, Math.max(0.48, settings.smoothing * 2.5)),
    });
    gestureEngineRef.current.setPinchThreshold(settings.pinchThreshold);
    gestureEngineRef.current.setDoublePinchInterval(settings.doublePinchMs);
    gestureEngineRef.current.setConfidenceThreshold(settings.confidenceThreshold);
  }, [settings]);

  useEffect(() => {
    if (!cursorRef.current) return;
    cursorControllerRef.current = new CursorController(
      cursorRef.current,
      pointerBridgeRef.current,
      setGestureState,
      (event) => {
        if (event.type !== 'MOVE' && event.type !== 'DRAG_MOVE') {
          setLastGestureAction({ event, at: performance.now() });
        }
      },
    );
    return () => {
      pointerBridgeRef.current.cancel();
      cursorControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    voiceRef.current?.destroy();
    voiceRef.current = controller
      ? new VoiceTextController(controller, {
          onListeningChange: setListening,
          onNotice: announce,
        })
      : null;
    return () => voiceRef.current?.destroy();
  }, [announce, controller]);

  useEffect(() => {
    const commandController = new VoiceCommandController({
      onCommand: (command) => voiceCommandHandlerRef.current(command),
      onDictation: (transcript) => dictationHandlerRef.current(transcript),
      onTranscript: (transcript) => {
        setLastVoicePhrase(transcript);
        setVoiceError(null);
      },
      onUnrecognized: (transcript) => {
        if (renamingRef.current) return;
        announce(`Heard “${transcript}”, but it did not match a command.`);
      },
      onStateChange: setVoiceCommandListening,
      onStatusChange: setVoiceStatus,
      onDictationModeChange: setDictationMode,
      onError: (message) => {
        setVoiceError(message);
        announce(message);
      },
      onRecovery: (message) => {
        setVoiceError(null);
        announce(message);
      },
    });
    voiceCommandRef.current = commandController;
    return () => {
      commandController.destroy();
      voiceCommandRef.current = null;
    };
  }, [announce]);

  useEffect(() => {
    const voiceCommands = voiceCommandRef.current;
    if (!voiceCommands) return;
    if (mode === 'gesture' && settings.voiceCommands) {
      voiceCommands.start();
    } else {
      voiceCommands.stop();
      if (pointerBridgeRef.current.isPressed()) {
        pointerBridgeRef.current.cancel();
        setGestureState(mode === 'gesture' ? 'HOVERING' : 'IDLE');
      }
    }
  }, [mode, settings.voiceCommands]);

  const startVoiceInput = useCallback(async () => {
    if (voiceInputRef.current) return;
    const monitor = new VoiceInputMonitor({
      onAudioFrame: (samples, sampleRate) => {
        voiceCommandRef.current?.acceptAudio(samples, sampleRate);
      },
    });
    voiceInputRef.current = monitor;
    setVoiceInputStatus('requesting');
    const state = await monitor.start();
    if (voiceInputRef.current !== monitor) {
      monitor.stop();
      return;
    }
    setVoiceInputStatus(state.status);
    setVoiceAnalyser(state.analyser);
    setVoiceDeviceLabel(state.deviceLabel ?? '');
    if (state.message) {
      setVoiceError(state.message);
      announce(state.message);
    }
  }, [announce]);

  const stopVoiceInput = useCallback(() => {
    const monitor = voiceInputRef.current;
    voiceInputRef.current = null;
    monitor?.stop();
    setVoiceAnalyser(null);
    setVoiceDeviceLabel('');
    setVoiceInputStatus('idle');
  }, []);

  useEffect(() => {
    if (mode === 'gesture' && settings.voiceCommands) void startVoiceInput();
    else stopVoiceInput();
  }, [mode, settings.voiceCommands, startVoiceInput, stopVoiceInput]);

  useEffect(() => {
    if (!voiceAnalyser || mode !== 'gesture' || !settings.voiceCommands) return;
    const samples = new Float32Array(voiceAnalyser.fftSize);
    let animation = 0;
    let lastSampleAt = -Infinity;
    const sampleVoiceActivity = (timestamp: number) => {
      if (timestamp - lastSampleAt >= 80) {
        lastSampleAt = timestamp;
        voiceAnalyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          sum += sample * sample;
        }
        voiceCommandRef.current?.reportAudioLevel(
          Math.sqrt(sum / samples.length),
          timestamp,
        );
      }
      animation = requestAnimationFrame(sampleVoiceActivity);
    };
    animation = requestAnimationFrame(sampleVoiceActivity);
    return () => cancelAnimationFrame(animation);
  }, [mode, settings.voiceCommands, voiceAnalyser]);

  const finishAirStroke = useCallback((stayArmed = true) => {
    const points = airStrokeRef.current;
    airStrokeRef.current = [];
    setAirStroke([]);
    const nextPhase: AirDrawPhase = stayArmed ? 'armed' : 'off';
    airDrawPhaseRef.current = nextPhase;
    setAirDrawPhase(nextPhase);
    setGestureState(stayArmed ? 'HOVERING' : 'IDLE');
    if (points.length < 4) {
      announce(stayArmed
        ? 'That stroke was too short. Close your thumb and draw again.'
        : 'Drawing mode ended.');
      return;
    }
    const result = controller?.createAirDrawing(points);
    announce(result?.label ?? 'I could not recognize that stroke. Try making it slightly larger and slower.');
  }, [announce, controller]);

  const stopAirDrawing = useCallback((finishCurrent = true) => {
    if (airDrawPhaseRef.current === 'drawing' && finishCurrent) {
      finishAirStroke(false);
    } else {
      airStrokeRef.current = [];
      setAirStroke([]);
      airDrawPhaseRef.current = 'off';
      setAirDrawPhase('off');
      setGestureState(mode === 'gesture' ? 'HOVERING' : 'IDLE');
    }
    thumbDrawDetectorRef.current.reset();
  }, [finishAirStroke, mode]);

  const stopGestureMode = useCallback(() => {
    runIdRef.current += 1;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    const events = gestureEngineRef.current.handLost(performance.now());
    events.forEach((event) => cursorControllerRef.current?.apply(event));
    trackerRef.current?.close();
    trackerRef.current = null;
    cameraRef.current?.stop();
    cameraRef.current = null;
    smootherRef.current.reset();
    zoomGestureRef.current.reset();
    zoomModeRef.current = false;
    zoomPhaseRef.current = 'ready';
    airDrawPhaseRef.current = 'off';
    airStrokeRef.current = [];
    thumbDrawDetectorRef.current.reset();
    previewRef.current?.draw(null, null);
    setMode('mouse');
    setCameraStatus('idle');
    setGestureState('IDLE');
    setTracking(emptyTracking);
    setPointer(null);
    pointerRef.current = null;
    setAnchorMarker(null);
    setZoomMode(false);
    setZoomPhase('ready');
    setAirDrawPhase('off');
    setAirStroke([]);
    voiceCommandRef.current?.stop();
    stopVoiceInput();
    setInitializing(false);
  }, [stopVoiceInput]);

  const runTrackingLoop = useCallback((runId: number) => {
    let lastVideoTime = -1;
    let lastHandSeen = performance.now();
    let handWasVisible = false;
    let lastStatusUpdate = 0;
    let fpsWindowStart = performance.now();
    let frames = 0;
    let fps = 0;
    let lastPointer: PointerPosition | null = null;

    const frameLoop = (timestamp: number) => {
      if (runId !== runIdRef.current) return;
      const video = videoRef.current;
      const tracker = trackerRef.current;
      let frame = null;

      if (
        video &&
        tracker &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;
        try {
          frame = tracker.detect(video, timestamp);
        } catch (error) {
          announce(error instanceof Error ? error.message : 'Hand tracking stopped unexpectedly.');
        }
      }

      if (frame && frame.confidence >= settingsRef.current.confidenceThreshold) {
        frames += 1;
        lastHandSeen = timestamp;
        handWasVisible = true;
        const index = frame.landmarks[8];
        if (index) {
          const smoothed = smootherRef.current.update(index);
          const viewport = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
          const mapped = mapperRef.current.map(smoothed, viewport);
          const position = mapperRef.current.applyDeadZone(mapped, lastPointer);
          lastPointer = position;
          pointerRef.current = position;
          const zoomActive = zoomModeRef.current;
          const airDrawingActive = airDrawPhaseRef.current !== 'off';
          const pinchActions = settingsRef.current.pinchActions && !zoomActive && !airDrawingActive;
          const result = pinchActions ? gestureEngineRef.current.update(frame, position) : null;
          const measurement = pinchActions
            ? null
            : calculatePinchMeasurement(frame.landmarks, frame.worldLandmarks);

          if (result || measurement) {
            if (result) {
              result.events.forEach((event) => cursorControllerRef.current?.apply(event));
            } else {
              cursorControllerRef.current?.voiceMove(position);
            }
            const pinchRatio = result?.reading.pinchRatio ?? measurement?.ratio ?? null;
            const pinchImageRatio = result?.reading.pinchImageRatio ?? measurement?.imageRatio ?? null;
            const pinchWorldRatio = result?.reading.pinchWorldRatio ?? measurement?.worldRatio ?? null;
            const pinchSource = result?.reading.pinchSource ?? measurement?.source ?? null;
            previewRef.current?.draw(frame.landmarks, pinchRatio);

            if (airDrawingActive) {
              const thumbReading = thumbDrawDetectorRef.current.update(
                frame.landmarks,
                frame.worldLandmarks,
                timestamp,
              );
              if (thumbReading?.transition === 'closed' && airDrawPhaseRef.current === 'armed') {
                airStrokeRef.current = [position];
                setAirStroke([position]);
                airDrawPhaseRef.current = 'drawing';
                setAirDrawPhase('drawing');
                setGestureState('DRAWING');
                setNotice('Ink is live. Trace the object, then open your thumb to clean it up.');
              } else if (airDrawPhaseRef.current === 'drawing') {
                const previous = airStrokeRef.current.at(-1);
                if (!previous || Math.hypot(position.x - previous.x, position.y - previous.y) >= 3) {
                  const nextStroke = [...airStrokeRef.current, position];
                  airStrokeRef.current = nextStroke;
                  setAirStroke(nextStroke);
                }
                if (thumbReading?.transition === 'opened') finishAirStroke(true);
              }
            }

            if (zoomActive) {
              const zoomReading = zoomGestureRef.current.update(frame.landmarks, timestamp);
              if (zoomReading) controller?.zoomAtClientPoint(position, zoomReading.factor);
              const nextZoomPhase = zoomGestureRef.current.getPhase();
              if (nextZoomPhase !== zoomPhaseRef.current) {
                zoomPhaseRef.current = nextZoomPhase;
                setZoomPhase(nextZoomPhase);
              }
            }

            if (timestamp - lastStatusUpdate > 110) {
              setTracking({
                handDetected: true,
                confidence: frame.confidence,
                fps,
                index: frame.landmarks[8] ?? null,
                thumb: frame.landmarks[4] ?? null,
                pinchRatio,
                pinchImageRatio,
                pinchWorldRatio,
                pinchSource,
              });
              setPointer(position);
              if (pinchActions) setGestureState(gestureEngineRef.current.getState());
              lastStatusUpdate = timestamp;
            }
          }
        }
      } else if (handWasVisible && timestamp - lastHandSeen > 180) {
        handWasVisible = false;
        lastPointer = null;
        pointerRef.current = null;
        smootherRef.current.reset();
        zoomGestureRef.current.reset();
        zoomPhaseRef.current = 'ready';
        setZoomPhase('ready');
        if (airDrawPhaseRef.current === 'drawing') finishAirStroke(true);
        thumbDrawDetectorRef.current.reset();
        gestureEngineRef.current
          .handLost(timestamp)
          .forEach((event) => cursorControllerRef.current?.apply(event));
        previewRef.current?.draw(null, null);
        setTracking((current) => ({
          ...current,
          handDetected: false,
          confidence: 0,
          index: null,
          thumb: null,
          pinchRatio: null,
          pinchImageRatio: null,
          pinchWorldRatio: null,
          pinchSource: null,
        }));
        setGestureState('IDLE');
      }

      if (timestamp - fpsWindowStart >= 1000) {
        fps = Math.round((frames * 1000) / (timestamp - fpsWindowStart));
        fpsWindowStart = timestamp;
        frames = 0;
      }
      animationRef.current = requestAnimationFrame(frameLoop);
    };

    animationRef.current = requestAnimationFrame(frameLoop);
  }, [announce, controller, finishAirStroke]);

  const startGestureMode = useCallback(async () => {
    if (!videoRef.current || initializing) return;
    if (settingsRef.current.voiceCommands) {
      setVoiceError(null);
      voiceCommandRef.current?.start();
      void startVoiceInput();
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setMode('gesture');
    setInitializing(true);
    setCameraStatus('requesting');
    setGestureState('IDLE');
    announce('Starting camera and hand tracking…');

    const camera = new CameraManager(videoRef.current);
    cameraRef.current = camera;

    try {
      const cameraPromise = camera.start();
      const { HandTracker: HandTrackerRuntime } = await import('./tracking/HandTracker');
      const tracker = new HandTrackerRuntime();
      trackerRef.current = tracker;
      const [cameraState] = await Promise.all([cameraPromise, tracker.initialize()]);
      if (runId !== runIdRef.current) {
        tracker.close();
        camera.stop();
        return;
      }
      setCameraStatus(cameraState.status);
      if (cameraState.status !== 'active') {
        throw new Error(cameraState.message ?? 'Camera permission is required for Gesture Mode.');
      }
      setInitializing(false);
      announce('Voice + Camera is active. Point to move; say “select,” “zoom,” “rectangle,” or “line start.”');
      runTrackingLoop(runId);
    } catch (error) {
      trackerRef.current?.close();
      camera.stop();
      trackerRef.current = null;
      cameraRef.current = null;
      setMode('mouse');
      setCameraStatus('error');
      setInitializing(false);
      announce(error instanceof Error ? error.message : 'Gesture Mode could not start.');
    }
  }, [announce, initializing, runTrackingLoop, startVoiceInput]);

  const retryVoiceCommands = useCallback(() => {
    const voiceCommands = voiceCommandRef.current;
    if (!voiceCommands) return;
    setVoiceError(null);
    setLastVoicePhrase('');
    stopVoiceInput();
    void startVoiceInput();
    voiceCommands.stop();
    if (voiceCommands.start()) {
      announce('Starting local voice… Say “select” after Voice shows Listening.');
    }
  }, [announce, startVoiceInput, stopVoiceInput]);

  useEffect(() => () => {
    stopGestureMode();
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, [stopGestureMode]);

  const handleMode = useCallback((nextMode: InputMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'gesture') void startGestureMode();
    else {
      stopGestureMode();
      announce('Mouse Mode restored. Camera and voice commands are off.');
    }
  }, [announce, mode, startGestureMode, stopGestureMode]);

  const handleControllerReady = useCallback((next: DrawioController) => {
    setController(next);
  }, []);

  const handleSelection = useCallback((label: string | null) => {
    setSelectedLabel(label);
  }, []);

  const handleTool = useCallback((tool: DiagramTool) => {
    controller?.setTool(tool);
    setActiveTool(tool);
  }, [controller]);

  const handleShape = useCallback((shape: ShapeKind) => {
    controller?.addShape(shape);
    setActiveTool('pointer');
    announce(`${shape === 'text' ? 'Text' : shape} added at the center of the canvas.`);
  }, [announce, controller]);

  const beginCommandDictation = useCallback(() => {
    if (!controller) return;
    const hovered = pointerRef.current
      ? controller.selectCellAtClientPoint(pointerRef.current)
      : false;
    if (!hovered && !controller.getSelectedLabel()) {
      announce('Point at a shape, then say “edit text” or “Whisper”.');
      return;
    }
    controller.stopEditing(true);
    dictationBufferRef.current = '';
    voiceCommandRef.current?.setDictationMode(true);
    announce('Dictating the selected label. Say “right shift” to finish.');
  }, [announce, controller]);

  const finishCommandDictation = useCallback(() => {
    voiceCommandRef.current?.setDictationMode(false);
    announce('Text editing finished. Voice commands are active again.');
  }, [announce]);

  const beginWisprRename = useCallback(async () => {
    const currentPointer = pointerRef.current;
    if (!controller || !currentPointer) {
      announce('Show your hand and hover over a box before saying “Rename”.');
      return;
    }
    if (wisprTransitionRef.current) return;
    if (controller.isEditing()) {
      announce('A rename field is already open. Dictate the new name, then say “Done”.');
      return;
    }
    controller.cancelSmartConnector();
    setAnchorMarker(null);
    if (!controller.beginRenameAtClientPoint(currentPointer)) {
      announce('No box is under the cursor. Hover inside one and say “Rename” again.');
      return;
    }
    renamingRef.current = true;
    setRenaming(true);
    setSelectedLabel(controller.getSelectedLabel());
    announce('Rename field ready. Opening Wispr Flow…');
    wisprTransitionRef.current = true;
    try {
      await triggerWisprHotkey('start');
      setWisprSetup(null);
      setVoiceError(null);
      announce('Wispr Flow is listening. Say the new name, then say “Done”.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wispr Flow could not be opened.';
      if (error instanceof WisprBridgeError && error.code === 'ACCESSIBILITY_REQUIRED') {
        setWisprSetup({ message, executable: error.executable });
      }
      controller.stopEditing(true);
      renamingRef.current = false;
      setRenaming(false);
      setVoiceError(message);
      announce(message);
    } finally {
      wisprTransitionRef.current = false;
    }
  }, [announce, controller]);

  const handleOpenAccessibilitySettings = useCallback(async () => {
    try {
      await openAccessibilitySettings();
      announce('Accessibility settings opened. Enable “node”, return here, and say “Rename” again.');
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Could not open Accessibility settings.');
    }
  }, [announce]);

  const finishWisprRename = useCallback(async () => {
    if (!controller?.isEditing()) {
      renamingRef.current = false;
      setRenaming(false);
      announce('No rename field is open. Hover over a box and say “Rename” first.');
      return;
    }
    if (wisprTransitionRef.current) return;
    wisprTransitionRef.current = true;
    announce('Stopping Wispr Flow and saving the new name…');
    let closeError: string | null = null;
    try {
      await triggerWisprHotkey('stop');
      setVoiceError(null);
    } catch (error) {
      closeError = error instanceof Error ? error.message : 'Wispr Flow could not be closed.';
      setVoiceError(closeError);
    }
    // Wispr can deliver its final words just after its stop hotkey. Keep the
    // editor focused briefly, then remove the spoken control word if Wispr
    // appended it before maxGraph commits the label.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 650));
    controller.removeTrailingRenameCommand();
    controller.stopEditing(false);
    const label = controller.getSelectedLabel();
    setSelectedLabel(label);
    renamingRef.current = false;
    setRenaming(false);
    wisprTransitionRef.current = false;
    announce(closeError
      ? `The label was saved, but Wispr may still be open: ${closeError}`
      : label ? `Renamed box to “${label}”.` : 'Box name updated.');
  }, [announce, controller]);

  const handleDictationTranscript = useCallback((transcript: string) => {
    if (!controller) return;
    dictationBufferRef.current = dictationBufferRef.current
      ? `${dictationBufferRef.current} ${transcript.trim()}`
      : transcript.trim();
    if (controller.setSelectedLabel(dictationBufferRef.current)) {
      setSelectedLabel(dictationBufferRef.current);
      setNotice(`Dictating: “${dictationBufferRef.current}”`);
    }
  }, [controller]);

  const handleVoiceCommand = useCallback((command: VoiceCommand) => {
    const currentPointer = pointerRef.current;
    const needsPointer = () => {
      if (currentPointer) return true;
      announce('Show your hand so the camera cursor has a target.');
      return false;
    };

    // While Wispr owns the rename field, ordinary dictated words must never
    // be interpreted as diagram commands. Only the stop/cancel controls stay
    // active until the editor is committed or dismissed.
    if (renamingRef.current && command.type !== 'finishRename' && command.type !== 'cancel') return;

    switch (command.type) {
      case 'click':
        if (needsPointer() && currentPointer) {
          if (command.button === 'left' && controller?.hasPendingSmartConnector()) {
            announce(controller.finishSmartConnectorAtClientPoint(currentPointer).label);
            break;
          }
          cursorControllerRef.current?.voiceClick(currentPointer, command.button);
          announce(command.button === 'right' ? 'Right click.' : 'Selected.');
        }
        break;
      case 'hold':
        if (needsPointer() && currentPointer) {
          cursorControllerRef.current?.voicePress(currentPointer, command.button);
          announce(`${command.button === 'right' ? 'Right' : 'Left'} button held. Move your finger, then say “release”.`);
        }
        break;
      case 'release':
        if (needsPointer() && currentPointer) {
          cursorControllerRef.current?.voiceRelease(currentPointer);
          announce('Released.');
        }
        break;
      case 'selectShape':
        if (needsPointer() && currentPointer) {
          announce(controller?.selectCellAtClientPoint(currentPointer)
            ? 'Shape selected.'
            : 'No shape is under the cursor.');
        }
        break;
      case 'selectAnchor':
        if (needsPointer() && currentPointer && controller) {
          const result = controller.selectVoiceAnchorAtClientPoint(currentPointer, command.anchor);
          setAnchorMarker(result.status === 'source'
            ? { point: result.point, anchor: command.anchor }
            : null);
          announce(result.label);
        }
        break;
      case 'rename':
        void beginWisprRename();
        break;
      case 'finishRename':
        void finishWisprRename();
        break;
      case 'startArrow':
        if (needsPointer() && currentPointer && controller) {
          handleTool('connector');
          setAnchorMarker(null);
          announce(controller.startSmartConnectorAtClientPoint(currentPointer).label);
        }
        break;
      case 'finishArrow':
        if (needsPointer() && currentPointer && controller) {
          announce(controller.finishSmartConnectorAtClientPoint(currentPointer).label);
        }
        break;
      case 'startLine':
        if (needsPointer() && currentPointer && controller) {
          handleTool('arrow');
          cursorControllerRef.current?.voicePress(currentPointer, 'left');
          announce('Line started here. Move your hand to the endpoint, then say “release”.');
        }
        break;
      case 'startZoom':
        if (needsPointer() && currentPointer) {
          stopAirDrawing(false);
          pointerBridgeRef.current.cancel();
          zoomGestureRef.current.reset();
          zoomModeRef.current = true;
          zoomPhaseRef.current = 'ready';
          setZoomMode(true);
          setZoomPhase('ready');
          setGestureState('HOVERING');
          announce('Zoom mode active. Move closer while opening thumb and index, or move back while closing them. Say “end zoom” to stop.');
        }
        break;
      case 'endZoom':
        zoomModeRef.current = false;
        zoomGestureRef.current.reset();
        zoomPhaseRef.current = 'ready';
        setZoomMode(false);
        setZoomPhase('ready');
        announce('Zoom mode ended. Normal controls restored.');
        break;
      case 'startDraw':
        pointerBridgeRef.current.cancel();
        zoomModeRef.current = false;
        zoomGestureRef.current.reset();
        zoomPhaseRef.current = 'ready';
        setZoomMode(false);
        setZoomPhase('ready');
        controller?.cancelVoiceConnector();
        controller?.cancelSmartConnector();
        handleTool('pointer');
        thumbDrawDetectorRef.current.reset();
        airStrokeRef.current = [];
        setAirStroke([]);
        airDrawPhaseRef.current = 'armed';
        setAirDrawPhase('armed');
        setGestureState('HOVERING');
        announce('Air Pen ready. Show an open thumb, then close it to draw. Open your thumb to finish and clean up the object.');
        break;
      case 'endDraw':
        stopAirDrawing(true);
        announce('Air Pen put away. Normal controls restored.');
        break;
      case 'editText':
      case 'startDictation':
        beginCommandDictation();
        break;
      case 'stopDictation':
        finishCommandDictation();
        break;
      case 'tool':
        handleTool(command.tool);
        announce(`${command.tool === 'arrow' ? 'Line' : command.tool === 'connector' ? 'Connector Arrow' : command.tool} tool selected.`);
        break;
      case 'addShape':
        if (needsPointer() && currentPointer && controller) {
          const added = controller.addShapeAtClientPoint(command.shape, currentPointer);
          if (added) {
            setActiveTool('pointer');
            announce(`${command.shape === 'text' ? 'Text' : command.shape} added at the pointer.`);
          } else {
            announce('Point inside the canvas, then say the shape name again.');
          }
        }
        break;
      case 'undo':
        controller?.undo();
        announce('Undone.');
        break;
      case 'redo':
        controller?.redo();
        announce('Redone.');
        break;
      case 'delete':
        controller?.deleteSelection();
        announce('Selection deleted.');
        break;
      case 'copy': {
        const count = controller?.copyAtClientPoint(currentPointer) ?? 0;
        announce(count
          ? `${count} object${count === 1 ? '' : 's'} copied. Point where you want them and say “paste”.`
          : 'Hover over an object or select multiple objects, then say “copy”.');
        break;
      }
      case 'cut': {
        const count = controller?.cutAtClientPoint(currentPointer) ?? 0;
        announce(count
          ? `${count} object${count === 1 ? '' : 's'} cut. Point where you want them and say “paste”.`
          : 'Hover over an object or select multiple objects, then say “cut”.');
        break;
      }
      case 'paste':
        if (needsPointer() && currentPointer) {
          const count = controller?.pasteAtClientPoint(currentPointer) ?? 0;
          announce(count
            ? `${count} object${count === 1 ? '' : 's'} pasted at the pointer.`
            : 'Nothing is copied yet, or the pointer is outside the canvas.');
        }
        break;
      case 'zoomIn':
        controller?.zoomIn();
        announce('Zoomed in.');
        break;
      case 'zoomOut':
        controller?.zoomOut();
        announce('Zoomed out.');
        break;
      case 'cancel':
        pointerBridgeRef.current.cancel();
        stopAirDrawing(false);
        zoomModeRef.current = false;
        zoomGestureRef.current.reset();
        zoomPhaseRef.current = 'ready';
        setZoomMode(false);
        setZoomPhase('ready');
        controller?.cancelVoiceConnector();
        controller?.cancelSmartConnector();
        if (renaming) void triggerWisprHotkey('stop').catch(() => undefined);
        if (controller?.isEditing()) controller.stopEditing(true);
        renamingRef.current = false;
        setRenaming(false);
        setAnchorMarker(null);
        setGestureState('HOVERING');
        announce('Current hold, drawing, or connector cancelled.');
        break;
    }
  }, [announce, beginCommandDictation, beginWisprRename, controller, finishCommandDictation, finishWisprRename, handleTool, renaming, stopAirDrawing]);

  voiceCommandHandlerRef.current = handleVoiceCommand;
  dictationHandlerRef.current = handleDictationTranscript;

  const handleVoice = useCallback(() => {
    if (mode === 'gesture' && settings.voiceCommands) {
      if (dictationMode) finishCommandDictation();
      else beginCommandDictation();
      return;
    }
    if (listening) {
      voiceRef.current?.stop();
      return;
    }
    if (!selectedLabel) {
      announce('Select a shape before using voice input.');
      return;
    }
    if (!voiceRef.current?.start()) {
      announce('Speech recognition is unavailable. You can still double-click and type.');
    }
  }, [announce, beginCommandDictation, dictationMode, finishCommandDictation, listening, mode, selectedLabel, settings.voiceCommands]);

  const handleProfileComplete = useCallback((profile: GestureProfile) => {
    saveGestureProfile(profile);
    setGestureProfile(profile);
    setSettings((current) => ({ ...current, pinchThreshold: profile.pinch.threshold }));
    announce(`Pinch trained at ${profile.pinch.threshold.toFixed(3)} and saved in this browser.`);
  }, [announce]);

  const handleProfileReset = useCallback(() => {
    clearGestureProfile();
    setGestureProfile(null);
    setSettings((current) => ({
      ...current,
      pinchThreshold: DEFAULT_PINCH_CONFIG.startThreshold,
    }));
    announce('Personal pinch training was cleared. The improved default is active.');
  }, [announce]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault();
        event.shiftKey ? controller?.redo() : controller?.undo();
        return;
      }
      if (key === 'delete' || key === 'backspace') controller?.deleteSelection();
      if (key === 'escape' || key === 'v') handleTool('pointer');
      if (key === 'r') handleShape('rectangle');
      if (key === 'o') handleShape('ellipse');
      if (key === 'a') handleTool('arrow');
      if (key === 'c') handleTool('connector');
      if (key === 'h') handleTool('pan');
      if (key === 't') handleShape('text');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [controller, handleShape, handleTool]);

  const statusDescription = useMemo(() => {
    if (initializing) return 'Loading hand model';
    if (mode === 'mouse') return 'Camera off';
    if (!tracking.handDetected) return 'Show one hand';
    if (airDrawPhase === 'drawing') return 'Air Pen drawing';
    if (airDrawPhase === 'armed') return 'Air Pen ready';
    if (zoomMode) return 'Zoom mode armed';
    if (settings.voiceCommands) {
      if (voiceInputStatus === 'suspended') return 'Tap retry microphone';
      if (voiceStatus === 'blocked') return 'Microphone blocked';
      if (voiceStatus === 'unsupported') return 'Voice unsupported';
      if (voiceStatus === 'error') return 'Voice error';
      if (voiceStatus === 'recovering') return 'Reconnecting voice';
      return voiceCommandListening ? 'Hand + local voice ready' : 'Loading local voice';
    }
    return 'Hand connected';
  }, [airDrawPhase, initializing, mode, settings.voiceCommands, tracking.handDetected, voiceCommandListening, voiceInputStatus, voiceStatus, zoomMode]);

  return (
    <div className={`app ${mode === 'gesture' ? 'is-gesture-mode' : ''}`}>
      <header className="topbar">
        <div className="brand" aria-label="AirDrawio">
          <span className="brand__mark"><i /><i /><i /></span>
          <span><strong>Air</strong>Drawio</span>
        </div>
        <div className="document-title">
          <span>System architecture</span>
          <small><i /> Local session</small>
        </div>
        <div className="mode-switch" role="group" aria-label="Input mode">
          <button className={mode === 'mouse' ? 'is-active' : ''} onClick={() => handleMode('mouse')}>
            <Icon name="pointer" /> Mouse
          </button>
          <button className={mode === 'gesture' ? 'is-active' : ''} onClick={() => handleMode('gesture')} disabled={initializing}>
            <Icon name="hand" /> {initializing ? 'Starting…' : 'Gesture'}
            <span className={mode === 'gesture' ? 'is-live' : ''} />
          </button>
        </div>
        <button className={`test-launch ${testOpen ? 'is-active' : ''}`} onClick={() => { setTrainerOpen(false); setTestOpen(true); }} disabled={!controller}>
          <Icon name="bug" /> Test controls
        </button>
        <div className="topbar__status">
          <span className={mode === 'gesture' && tracking.handDetected ? 'is-live' : ''} />
          <div><strong>{mode === 'gesture' && settings.voiceCommands ? 'Voice + Camera' : mode === 'gesture' ? 'Gesture Mode' : 'Mouse Mode'}</strong><small>{statusDescription}</small></div>
        </div>
      </header>

      <main className="workspace">
        <GestureToolbar
          activeTool={activeTool}
          gestureMode={mode === 'gesture'}
          listening={listening}
          onTool={handleTool}
          onShape={handleShape}
          onUndo={() => controller?.undo()}
          onRedo={() => controller?.redo()}
          onVoice={handleVoice}
        />

        <section className="stage">
          <MaxGraphCanvas
            onReady={handleControllerReady}
            onSelectionChange={handleSelection}
            onNotice={announce}
          />
          <CameraPreview
            ref={previewRef}
            videoRef={videoRef}
            visible={mode === 'gesture' && settings.showPreview}
          />
          <VoiceGraphVisualizer
            analyser={voiceAnalyser}
            status={voiceInputStatus}
            recognitionListening={voiceCommandListening}
            lastPhrase={lastVoicePhrase}
            deviceLabel={voiceDeviceLabel}
            visible={mode === 'gesture' && settings.voiceCommands}
          />
          <DebugOverlay
            visible={mode === 'gesture' && settings.showDebug}
            snapshot={tracking}
            gesture={gestureState}
            pointer={pointer}
          />
          {wisprSetup && (
            <section className="wispr-permission-card" role="alertdialog" aria-labelledby="wispr-permission-title">
              <div className="wispr-permission-card__icon"><Icon name="mic" /></div>
              <div className="wispr-permission-card__content">
                <span className="eyebrow">One-time macOS setup</span>
                <h2 id="wispr-permission-title">Allow hands-free Wispr control</h2>
                <p>{wisprSetup.message}</p>
                <ol>
                  <li>Open Accessibility settings.</li>
                  <li>Turn on <strong>node</strong>. If it is missing, click +, press <strong>⌘⇧G</strong>, paste this path, and choose Open:</li>
                </ol>
                {wisprSetup.executable && <code>{wisprSetup.executable}</code>}
                <small>Return to AirDrawio afterward and say “Rename” again. This approval is required only once.</small>
              </div>
              <div className="wispr-permission-card__actions">
                <button onClick={() => void handleOpenAccessibilitySettings()}>Open Accessibility settings</button>
                <button className="is-secondary" onClick={() => setWisprSetup(null)}>Not now</button>
              </div>
            </section>
          )}
          {initializing && (
            <div className="initializing-card" role="status">
              <span className="loader"><i /><i /><i /></span>
              <div><strong>Preparing Gesture Mode</strong><small>Loading the hand model and camera…</small></div>
            </div>
          )}
          {(listening || dictationMode || renaming) && (
            <div className="listening-pill" role="status">
              <Icon name="mic" /><span>{renaming ? 'Wispr rename active · dictate the name · say “Done” to save' : dictationMode ? 'Dictating label · say “right shift” to finish' : 'Listening for a label'}</span><i /><i /><i />
            </div>
          )}
          {mode === 'gesture' && settings.voiceCommands && (
            <div className={`voice-command-hud ${voiceCommandListening ? 'is-live' : ''} ${voiceError ? 'has-error' : ''} ${zoomMode ? 'is-zooming' : ''} ${airDrawPhase !== 'off' ? 'is-drawing' : ''}`} role="status">
              <span><i /><Icon name="mic" /> Voice commands</span>
              <strong>{voiceError ?? (airDrawPhase !== 'off'
                ? airDrawPhase === 'drawing'
                  ? 'Air Pen drawing · open thumb to finish'
                  : 'Air Pen ready · close thumb to draw'
                : zoomMode
                ? zoomPhase === 'zooming-in'
                  ? 'Zooming in · opening stroke locked'
                  : zoomPhase === 'zooming-out'
                    ? 'Zooming out · closing stroke locked'
                    : zoomPhase === 'resetting'
                      ? 'Resetting hand position · zoom is unchanged'
                      : 'Zoom ready at the pointer'
                : lastVoicePhrase ? `“${lastVoicePhrase}”` : 'Say “select”, “zoom”, “rectangle”, “copy”, or “line start”')}</strong>
              <small>{renaming ? 'Wispr rename mode · say “Done” to commit' : dictationMode ? 'Command-only local voice · use Rename for Wispr dictation' : airDrawPhase !== 'off' ? 'Say “stop drawing” to put the pen away' : zoomMode ? (zoomPhase === 'resetting' ? 'Return to a comfortable pose, pause, then make the next deliberate stroke' : 'Closer + open: zoom in · back + close: zoom out · reverse motion only resets') : voiceStatus === 'listening' ? (pointerBridgeRef.current.isPressed() ? 'Button held · say “release”' : 'Offline command engine · audio stays on this device') : `Local voice ${voiceStatus}`}</small>
              {(voiceStatus !== 'listening' || voiceInputStatus === 'suspended') && (
                <button onClick={retryVoiceCommands}>Retry microphone</button>
              )}
            </div>
          )}
          {airDrawPhase !== 'off' && (
            <svg className={`air-ink-overlay air-ink-overlay--${airDrawPhase}`} aria-hidden="true">
              {airStroke.length > 1 && (
                <polyline points={airStroke.map((point) => `${point.x},${point.y}`).join(' ')} />
              )}
              {airStroke[0] && <circle cx={airStroke[0].x} cy={airStroke[0].y} r="6" />}
            </svg>
          )}
          {anchorMarker && (
            <div
              className="voice-anchor-marker"
              style={{ left: anchorMarker.point.x, top: anchorMarker.point.y }}
              aria-hidden="true"
            >
              <i /><span>{anchorMarker.anchor}</span>
            </div>
          )}
          {controller && testOpen && (
            <GuidedTestFlow
              controller={controller}
              mode={mode}
              cameraStatus={cameraStatus}
              tracking={tracking}
              pointer={pointer}
              lastGestureAction={lastGestureAction}
              dictating={dictationMode}
              onRequestGesture={() => handleMode('gesture')}
              onRequestMouse={() => handleMode('mouse')}
              onToolChange={handleTool}
              onClose={() => setTestOpen(false)}
            />
          )}
          {trainerOpen && (
            <GestureTrainer
              mode={mode}
              tracking={tracking}
              onRequestGesture={() => handleMode('gesture')}
              onComplete={handleProfileComplete}
              onClose={() => setTrainerOpen(false)}
            />
          )}
        </section>

        <div className="right-rail">
          <StatusPanel
            camera={cameraStatus}
            handDetected={tracking.handDetected}
            gesture={gestureState}
            fps={tracking.fps}
            confidence={tracking.confidence}
            voiceEnabled={mode === 'gesture' && settings.voiceCommands}
            voiceListening={voiceCommandListening}
            voiceStatus={voiceStatus}
            dictating={dictationMode || renaming}
            zoomActive={zoomMode}
            zoomPhase={zoomPhase}
          />
          <SettingsPanel
            settings={settings}
            selectedLabel={selectedLabel}
            onChange={setSettings}
            onDelete={() => controller?.deleteSelection()}
            onColor={(color) => controller?.setSelectedFillColor(color)}
            onZoomIn={() => controller?.zoomIn()}
            onZoomOut={() => controller?.zoomOut()}
            onResetZoom={() => controller?.resetZoom()}
            pinchTrained={Boolean(gestureProfile)}
            onTrainPinch={() => { setTestOpen(false); setTrainerOpen(true); }}
            onResetPinch={handleProfileReset}
          />
        </div>
      </main>

      <footer className="statusbar" aria-live="polite">
        <div><Icon name="spark" /><span>{notice}</span></div>
        <div className="gesture-legend">
          <span><kbd>point</kbd> move</span>
          <span><kbd>select</kbd> click</span>
          <span><kbd>hold</kbd> drag</span>
          <span><kbd>rename</kbd> edit name</span>
          <span><kbd>start arrow</kbd> connect</span>
          <span><kbd>zoom</kbd> gesture zoom</span>
          <span><kbd>draw</kbd> air pen</span>
          <span><kbd>release</kbd> drop</span>
        </div>
      </footer>

      <VirtualCursor ref={cursorRef} visible={mode === 'gesture'} state={gestureState} />
    </div>
  );
}
