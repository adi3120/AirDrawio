import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CameraStatus } from '../camera/cameraTypes';
import type { DrawioController, GestureTestFixture, CellMetrics } from '../drawio/DrawioController';
import type { DiagramTool } from '../drawio/DrawioBridge';
import type { GestureEvent, PointerPosition } from '../gestures/gestureTypes';
import type { TrackingSnapshot } from '../tracking/handTypes';
import {
  GUIDED_TEST_STEPS,
  hasMoved,
  hasResized,
  isPointInside,
  type GuidedTestId,
  type GuidedTestStatus,
} from '../testing/guidedTestModel';
import { Icon } from './Icon';

export interface GestureActionSignal {
  event: GestureEvent;
  at: number;
}

interface GuidedTestFlowProps {
  controller: DrawioController;
  mode: 'mouse' | 'gesture';
  cameraStatus: CameraStatus;
  tracking: TrackingSnapshot;
  pointer: PointerPosition | null;
  lastGestureAction: GestureActionSignal | null;
  dictating: boolean;
  onRequestGesture(): void;
  onRequestMouse(): void;
  onToolChange(tool: DiagramTool): void;
  onClose(): void;
}

type FlowPhase = 'intro' | 'running' | 'summary';

const createStatuses = (): Record<GuidedTestId, GuidedTestStatus> =>
  Object.fromEntries(
    GUIDED_TEST_STEPS.map((step) => [step.id, 'pending']),
  ) as Record<GuidedTestId, GuidedTestStatus>;

export function GuidedTestFlow({
  controller,
  mode,
  cameraStatus,
  tracking,
  pointer,
  lastGestureAction,
  dictating,
  onRequestGesture,
  onRequestMouse,
  onToolChange,
  onClose,
}: GuidedTestFlowProps) {
  const [phase, setPhase] = useState<FlowPhase>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [statuses, setStatuses] = useState(createStatuses);
  const [showHelp, setShowHelp] = useState(false);
  const [stepStartedAt, setStepStartedAt] = useState(0);
  const [baseline, setBaseline] = useState<CellMetrics | null>(null);
  const [labelBaseline, setLabelBaseline] = useState<string | null>(null);
  const checkpointRef = useRef<HTMLDivElement>(null);
  const fixtureRef = useRef<GestureTestFixture | null>(null);

  const step = GUIDED_TEST_STEPS[currentIndex];
  const status = step ? statuses[step.id] : 'pending';

  const finishAndClose = useCallback(() => {
    controller.stopEditing(true);
    controller.clearGestureTestFixture();
    onRequestMouse();
    onClose();
  }, [controller, onClose, onRequestMouse]);

  useEffect(() => () => {
    controller.stopEditing(true);
    controller.clearGestureTestFixture();
  }, [controller]);

  const startTest = useCallback(() => {
    fixtureRef.current = controller.prepareGestureTestFixture();
    controller.setTool('pointer');
    onToolChange('pointer');
    setStatuses(createStatuses());
    setCurrentIndex(0);
    setShowHelp(false);
    setPhase('running');
    onRequestGesture();
  }, [controller, onRequestGesture, onToolChange]);

  useEffect(() => {
    if (phase !== 'running' || !step) return;
    const fixture = fixtureRef.current;
    setShowHelp(false);
    setStepStartedAt(performance.now());
    setStatuses((current) => ({ ...current, [step.id]: 'running' }));
    setBaseline(null);
    setLabelBaseline(null);

    if (!fixture) return;
    if (step.id === 'drag') {
      controller.stopEditing(true);
      controller.setTool('pointer');
      onToolChange('pointer');
      controller.selectCellById(fixture.subjectId);
      setBaseline(controller.getCellMetrics(fixture.subjectId));
    }
    if (step.id === 'resize') {
      controller.setTool('pointer');
      onToolChange('pointer');
      controller.selectCellById(fixture.subjectId);
      setBaseline(controller.getCellMetrics(fixture.subjectId));
    }
    if (step.id === 'connector') {
      controller.stopEditing(false);
      controller.setTool('arrow');
      onToolChange('arrow');
    }
    if (step.id === 'text') {
      controller.setTool('pointer');
      onToolChange('pointer');
      controller.selectCellById(fixture.subjectId);
    }
    if (step.id === 'voice') {
      controller.stopEditing(false);
      controller.setTool('pointer');
      onToolChange('pointer');
      controller.selectCellById(fixture.subjectId);
      setLabelBaseline(controller.getCellLabel(fixture.subjectId));
    }
  }, [controller, currentIndex, onToolChange, phase, step]);

  const markPassed = useCallback(() => {
    if (!step || statuses[step.id] !== 'running') return;
    setStatuses((current) => ({ ...current, [step.id]: 'passed' }));
  }, [statuses, step]);

  useEffect(() => {
    if (phase !== 'running' || !step || status !== 'running') return;
    const check = () => {
      const fixture = fixtureRef.current;
      let passed = false;

      switch (step.id) {
        case 'tracking':
          passed = cameraStatus === 'active' && tracking.handDetected;
          break;
        case 'cursor':
          passed = isPointInside(pointer, checkpointRef.current?.getBoundingClientRect() ?? null, 8);
          break;
        case 'pinch': {
          const event = lastGestureAction?.event;
          passed = Boolean(
            lastGestureAction &&
              lastGestureAction.at >= stepStartedAt &&
              event?.type === 'PINCH_END' &&
              !event.wasDrag &&
              isPointInside(event.position, checkpointRef.current?.getBoundingClientRect() ?? null, 8),
          );
          break;
        }
        case 'drag':
          passed = Boolean(fixture && hasMoved(controller.getCellMetrics(fixture.subjectId), baseline));
          break;
        case 'resize':
          passed = Boolean(fixture && hasResized(controller.getCellMetrics(fixture.subjectId), baseline));
          break;
        case 'connector':
          passed = Boolean(fixture && controller.areCellsConnected(fixture.subjectId, fixture.targetId));
          break;
        case 'text':
          passed = Boolean(fixture && (dictating || controller.isEditingCell(fixture.subjectId)));
          break;
        case 'voice':
          passed = Boolean(
            fixture &&
              labelBaseline !== null &&
              controller.getCellLabel(fixture.subjectId) !== labelBaseline,
          );
          break;
        case 'mouse':
          passed = mode === 'mouse';
          break;
      }
      if (passed) markPassed();
    };

    check();
    const interval = window.setInterval(check, 180);
    return () => window.clearInterval(interval);
  }, [
    baseline,
    cameraStatus,
    controller,
    dictating,
    labelBaseline,
    lastGestureAction,
    markPassed,
    mode,
    phase,
    pointer,
    status,
    step,
    stepStartedAt,
    tracking.handDetected,
  ]);

  const markFailed = () => {
    if (!step) return;
    setStatuses((current) => ({ ...current, [step.id]: 'failed' }));
  };

  const nextStep = () => {
    if (currentIndex >= GUIDED_TEST_STEPS.length - 1) {
      controller.stopEditing(false);
      setPhase('summary');
      return;
    }
    setCurrentIndex((index) => index + 1);
  };

  const completedCount = useMemo(
    () => Object.values(statuses).filter((value) => value === 'passed' || value === 'failed').length,
    [statuses],
  );
  const passedCount = useMemo(
    () => Object.values(statuses).filter((value) => value === 'passed').length,
    [statuses],
  );
  const failedCount = useMemo(
    () => Object.values(statuses).filter((value) => value === 'failed').length,
    [statuses],
  );

  const showCheckpoint = phase === 'running' && (step.id === 'cursor' || step.id === 'pinch');

  return (
    <>
      {showCheckpoint && (
        <div
          ref={checkpointRef}
          className={`gesture-test-checkpoint ${status === 'passed' ? 'is-passed' : ''}`}
          aria-label="Gesture test checkpoint"
        >
          <span><i /></span>
          <strong>{step.id === 'cursor' ? 'MOVE HERE' : 'SAY SELECT'}</strong>
        </div>
      )}

      <section className={`guided-test guided-test--${phase}`} aria-label="Guided voice and camera test">
        <header className="guided-test__header">
          <div className="guided-test__title">
            <span><Icon name="bug" /></span>
            <div>
              <small>Interaction lab</small>
              <strong>Voice + camera test</strong>
            </div>
          </div>
          <button className="guided-test__close" onClick={finishAndClose} aria-label="Close guided test">×</button>
        </header>

        {phase === 'intro' && (
          <div className="guided-test__intro">
            <div className="test-orbit" aria-hidden="true"><i /><i /><i /></div>
            <span className="eyebrow">9 live checks · about 3 minutes</span>
            <h2>Let’s test the full hands-free loop.</h2>
            <p>
              The app will watch the actual camera, cursor, graph geometry, connectors, and labels. A step passes only when its expected state appears on screen.
            </p>
            <ul>
              <li><i /> Two temporary test shapes will be added.</li>
              <li><i /> Each successful action is detected automatically.</li>
              <li><i /> If it stalls, open the exact coaching for that step.</li>
            </ul>
            <button className="guided-test__primary" onClick={startTest}>
              Start voice + camera <Icon name="chevron" />
            </button>
            <small className="guided-test__privacy">Camera frames stay in the browser and are not recorded.</small>
          </div>
        )}

        {phase === 'running' && step && (
          <div className="guided-test__body">
            <div className="test-progress">
              <span>Test {currentIndex + 1} of {GUIDED_TEST_STEPS.length}</span>
              <strong>{completedCount}/{GUIDED_TEST_STEPS.length}</strong>
              <div><i style={{ width: `${((currentIndex + (status === 'passed' || status === 'failed' ? 1 : 0)) / GUIDED_TEST_STEPS.length) * 100}%` }} /></div>
            </div>

            <div className="test-step-heading">
              <span className={`test-state test-state--${status}`}>
                {status === 'passed' ? '✓' : status === 'failed' ? '!' : currentIndex + 1}
              </span>
              <div><span className="eyebrow">{status === 'passed' ? 'Passed' : status === 'failed' ? 'Recorded failure' : 'Your action'}</span><h2>{step.title}</h2></div>
            </div>

            <p className="test-instruction">{step.instruction}</p>

            <div className={`test-watch ${status === 'passed' ? 'is-passed' : status === 'failed' ? 'is-failed' : ''}`} aria-live="polite">
              <span className="test-watch__pulse"><i /></span>
              <div>
                <small>{status === 'passed' ? 'Verified on screen' : status === 'failed' ? 'Not verified' : 'Watching for'}</small>
                <strong>{status === 'passed' ? 'Expected change detected' : status === 'failed' ? 'You marked this step as failed' : step.watching}</strong>
              </div>
            </div>

            {showHelp && status === 'running' && (
              <div className="test-help">
                <span className="eyebrow">Try this exactly</span>
                <ol>{step.help.map((item) => <li key={item}>{item}</li>)}</ol>
              </div>
            )}

            {(status === 'passed' || status === 'failed') ? (
              <button className="guided-test__primary" onClick={nextStep}>
                {currentIndex === GUIDED_TEST_STEPS.length - 1 ? 'View results' : 'Next test'} <Icon name="chevron" />
              </button>
            ) : (
              <div className="test-actions">
                <button className="test-actions__help" onClick={() => setShowHelp((value) => !value)}>
                  {showHelp ? 'Hide help' : 'I need help'}
                </button>
                {showHelp && <button className="test-actions__fail" onClick={markFailed}>Still not working — mark failed</button>}
              </div>
            )}

            <div className="test-step-dots" aria-label="Test progress">
              {GUIDED_TEST_STEPS.map((item, index) => (
                <span key={item.id} className={`${statuses[item.id]} ${index === currentIndex ? 'is-current' : ''}`} />
              ))}
            </div>
          </div>
        )}

        {phase === 'summary' && (
          <div className="guided-test__summary">
            <div className={`test-score ${failedCount === 0 ? 'is-perfect' : ''}`}>
              <strong>{passedCount}</strong><span>/ {GUIDED_TEST_STEPS.length}</span>
            </div>
            <span className="eyebrow">Session complete</span>
            <h2>{failedCount === 0 ? 'Every control passed.' : `${failedCount} ${failedCount === 1 ? 'control needs' : 'controls need'} tuning.`}</h2>
            <p>{failedCount === 0 ? 'The full voice-and-camera interaction loop is working on this setup.' : 'Your failures are recorded below. Retry after adjusting camera position, microphone access, or speech timing.'}</p>
            <div className="test-results">
              {GUIDED_TEST_STEPS.map((item) => (
                <div key={item.id}><span className={statuses[item.id]}>{statuses[item.id] === 'passed' ? '✓' : '!'}</span><strong>{item.title}</strong><small>{statuses[item.id]}</small></div>
              ))}
            </div>
            <button className="guided-test__primary" onClick={failedCount ? startTest : finishAndClose}>
              {failedCount ? 'Retry the full test' : 'Return to the editor'} <Icon name="chevron" />
            </button>
            {failedCount > 0 && <button className="guided-test__secondary" onClick={finishAndClose}>Keep results and close</button>}
          </div>
        )}
      </section>
    </>
  );
}
