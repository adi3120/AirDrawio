import type { CameraStatus } from '../camera/cameraTypes';
import type { GestureState } from '../gestures/gestureTypes';
import type { VoiceRecognitionStatus } from '../voice/VoiceCommandController';
import type { ZoomGesturePhase } from '../gestures/ZoomGestureDetector';

interface StatusPanelProps {
  camera: CameraStatus;
  handDetected: boolean;
  gesture: GestureState;
  fps: number;
  confidence: number;
  voiceEnabled: boolean;
  voiceListening: boolean;
  voiceStatus: VoiceRecognitionStatus;
  dictating: boolean;
  zoomActive: boolean;
  zoomPhase: ZoomGesturePhase;
}

function StatusRow({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={active ? 'is-active' : ''}>
        {active !== undefined && <i />}
        {value}
      </strong>
    </div>
  );
}

export function StatusPanel({
  camera,
  handDetected,
  gesture,
  fps,
  confidence,
  voiceEnabled,
  voiceListening,
  voiceStatus,
  dictating,
  zoomActive,
  zoomPhase,
}: StatusPanelProps) {
  return (
    <section className="status-panel" aria-label="Gesture tracking status">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Live signal</span>
          <h2>Tracking</h2>
        </div>
        <span className={`signal ${handDetected ? 'is-live' : ''}`}><b /><b /><b /></span>
      </div>
      <StatusRow label="Camera" value={camera === 'active' ? 'Active' : camera} active={camera === 'active'} />
      <StatusRow label="Hand" value={handDetected ? 'Detected' : 'Not detected'} active={handDetected} />
      <StatusRow label="Gesture" value={gesture.replace('_', ' ')} />
      <StatusRow
        label="Zoom"
        value={zoomActive
          ? zoomPhase === 'zooming-in'
            ? 'Zooming in'
            : zoomPhase === 'zooming-out'
              ? 'Zooming out'
              : zoomPhase === 'resetting'
                ? 'Resetting'
                : 'Armed'
          : 'Off'}
        active={zoomActive}
      />
      <StatusRow
        label="Voice"
        value={!voiceEnabled
          ? 'Off'
          : dictating
            ? 'Dictating'
            : voiceListening
              ? 'Listening'
              : voiceStatus === 'recovering'
                ? 'Reconnecting'
              : voiceStatus === 'blocked'
                ? 'Mic blocked'
                : voiceStatus === 'unsupported'
                  ? 'Unsupported'
                  : voiceStatus === 'error'
                    ? 'Error'
                    : 'Starting'}
        active={voiceEnabled && voiceListening}
      />
      <StatusRow label="Tracking" value={`${fps} fps`} />
      <StatusRow label="Confidence" value={handDetected ? `${Math.round(confidence * 100)}%` : '—'} />
      <div className="confidence-track" aria-hidden="true">
        <span style={{ width: `${confidence * 100}%` }} />
      </div>
    </section>
  );
}
