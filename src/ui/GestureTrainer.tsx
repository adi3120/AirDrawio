import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createGestureProfile,
  PINCH_TRAINING_SAMPLE_COUNT,
  type GestureProfile,
} from '../gestures/GestureProfile';
import type { TrackingSnapshot } from '../tracking/handTypes';
import { Icon } from './Icon';

type TrainerPhase = 'intro' | 'capture' | 'complete';

interface GestureTrainerProps {
  mode: 'mouse' | 'gesture';
  tracking: TrackingSnapshot;
  onRequestGesture(): void;
  onComplete(profile: GestureProfile): void;
  onClose(): void;
}

export function GestureTrainer({
  mode,
  tracking,
  onRequestGesture,
  onComplete,
  onClose,
}: GestureTrainerProps) {
  const [phase, setPhase] = useState<TrainerPhase>('intro');
  const [samples, setSamples] = useState<number[]>([]);
  const [profile, setProfile] = useState<GestureProfile | null>(null);
  const [message, setMessage] = useState('');

  const liveRatio = tracking.handDetected ? tracking.pinchRatio : null;
  const canCapture = liveRatio !== null && Number.isFinite(liveRatio);
  const progress = Math.round((samples.length / PINCH_TRAINING_SAMPLE_COUNT) * 100);
  const sampleRange = useMemo(() => {
    if (!samples.length) return null;
    return `${Math.min(...samples).toFixed(2)}–${Math.max(...samples).toFixed(2)}`;
  }, [samples]);

  const start = useCallback(() => {
    setSamples([]);
    setProfile(null);
    setMessage('');
    setPhase('capture');
    if (mode !== 'gesture') onRequestGesture();
  }, [mode, onRequestGesture]);

  const capture = useCallback(() => {
    if (phase !== 'capture') return;
    if (!canCapture || liveRatio === null) {
      setMessage('Show one hand clearly, then hold your comfortable pinch and try again.');
      return;
    }

    const next = [...samples, liveRatio];
    setSamples(next);
    setMessage('');
    if (next.length === PINCH_TRAINING_SAMPLE_COUNT) {
      const nextProfile = createGestureProfile(next, tracking.pinchSource ?? 'image');
      setProfile(nextProfile);
      onComplete(nextProfile);
      setPhase('complete');
    }
  }, [canCapture, liveRatio, onComplete, phase, samples, tracking.pinchSource]);

  useEffect(() => {
    if (phase !== 'capture') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('button, input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      capture();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capture, phase]);

  return (
    <div className="gesture-trainer" role="dialog" aria-modal="true" aria-label="Train gestures">
      <section className="gesture-trainer__card">
        <header className="gesture-trainer__header">
          <div>
            <span className="gesture-trainer__icon"><Icon name="hand" /></span>
            <span><small>Personal calibration</small><strong>Train your pinch</strong></span>
          </div>
          <button onClick={onClose} aria-label="Close gesture trainer">×</button>
        </header>

        {phase === 'intro' && (
          <div className="gesture-trainer__content">
            <span className="eyebrow">10 examples · about 30 seconds</span>
            <h2>Show me what a comfortable pinch means to you.</h2>
            <p>Turn your hand naturally—even with your fingers pointing left or right. Hold each pinch, then click <strong>Capture pinch</strong> or press Space.</p>
            <div className="trainer-note">
              <i /> This learns your threshold locally. Camera images are never stored; only ten numeric distances are saved in this browser.
            </div>
            <button className="gesture-trainer__primary" onClick={start}>
              {mode === 'gesture' ? 'Begin 10 captures' : 'Start camera & training'} <Icon name="chevron" />
            </button>
          </div>
        )}

        {phase === 'capture' && (
          <div className="gesture-trainer__content">
            <div className="trainer-progress__labels">
              <span>Pinch samples</span><strong>{samples.length}/{PINCH_TRAINING_SAMPLE_COUNT}</strong>
            </div>
            <div className="trainer-progress"><span style={{ width: `${progress}%` }} /></div>

            <div className={`trainer-live ${tracking.handDetected ? 'is-live' : ''}`}>
              <span><i /> {tracking.handDetected ? 'Hand ready' : 'Waiting for your hand'}</span>
              <strong>{liveRatio === null ? '—' : liveRatio.toFixed(3)}</strong>
              <small>{tracking.pinchSource === 'world' ? '3D orientation-safe measurement' : '2D fallback measurement'}</small>
            </div>

            <h2>Hold pinch #{Math.min(samples.length + 1, PINCH_TRAINING_SAMPLE_COUNT)}</h2>
            <p>Touch thumb and index finger in the way that feels natural. Vary the angle a little across captures.</p>

            <div className="trainer-samples" aria-label={`${samples.length} samples captured`}>
              {Array.from({ length: PINCH_TRAINING_SAMPLE_COUNT }, (_, index) => (
                <i key={index} className={index < samples.length ? 'is-filled' : ''} />
              ))}
            </div>

            {message && <p className="trainer-warning">{message}</p>}
            <button className="gesture-trainer__primary" onClick={capture} disabled={!canCapture}>
              Capture pinch <kbd>Space</kbd>
            </button>
            <div className="trainer-actions">
              <button onClick={() => setSamples((current) => current.slice(0, -1))} disabled={!samples.length}>Undo last</button>
              <button onClick={start}>Restart</button>
              <span>{sampleRange ? `range ${sampleRange}` : 'no samples yet'}</span>
            </div>
          </div>
        )}

        {phase === 'complete' && profile && (
          <div className="gesture-trainer__content gesture-trainer__complete">
            <span className="trainer-success">✓</span>
            <span className="eyebrow">Profile saved</span>
            <h2>Your pinch is now trained.</h2>
            <p>The learned start threshold is <strong>{profile.pinch.threshold.toFixed(3)}</strong>. It now applies to selecting, dragging, resizing, connecting, and double-pinching.</p>
            <div className="trainer-note"><i /> The profile stays in this browser and loads automatically next time.</div>
            <button className="gesture-trainer__primary" onClick={onClose}>Done</button>
            <button className="gesture-trainer__secondary" onClick={start}>Train again</button>
          </div>
        )}
      </section>
    </div>
  );
}
