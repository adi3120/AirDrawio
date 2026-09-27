import { Icon } from './Icon';

export interface GestureSettings {
  sensitivity: number;
  smoothing: number;
  pinchThreshold: number;
  doublePinchMs: number;
  confidenceThreshold: number;
  mirrorX: boolean;
  showPreview: boolean;
  showDebug: boolean;
  voiceCommands: boolean;
  pinchActions: boolean;
}

interface SettingsPanelProps {
  settings: GestureSettings;
  selectedLabel: string | null;
  onChange(settings: GestureSettings): void;
  onDelete(): void;
  onColor(color: string): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onResetZoom(): void;
  pinchTrained: boolean;
  onTrainPinch(): void;
  onResetPinch(): void;
}

function Range({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange(value: number): void;
}) {
  return (
    <label className="setting-range">
      <span>{label}<output>{display}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function SettingsPanel({
  settings,
  selectedLabel,
  onChange,
  onDelete,
  onColor,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  pinchTrained,
  onTrainPinch,
  onResetPinch,
}: SettingsPanelProps) {
  const update = <K extends keyof GestureSettings>(key: K, value: GestureSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <aside className="inspector" aria-label="Gesture and diagram settings">
      <section className="inspector__section selection-card">
        <span className="eyebrow">Selection</span>
        <div className="selection-card__name">
          <span className={selectedLabel ? 'is-selected' : ''} />
          <strong>{selectedLabel ?? 'Nothing selected'}</strong>
        </div>
        <div className="color-row" aria-label="Shape color">
          {['#ecfeff', '#f5f3ff', '#fff7ed', '#f0fdf4', '#ffffff'].map((color) => (
            <button
              key={color}
              style={{ background: color }}
              onClick={() => onColor(color)}
              aria-label={`Set fill color ${color}`}
              disabled={!selectedLabel}
            />
          ))}
          <button className="delete-button" onClick={onDelete} disabled={!selectedLabel} aria-label="Delete selection">
            <Icon name="trash" />
          </button>
        </div>
      </section>

      <section className="inspector__section">
        <div className="panel-heading panel-heading--small">
          <div>
            <span className="eyebrow">Calibration</span>
            <h2>Gesture feel</h2>
          </div>
          <Icon name="settings" />
        </div>
        <Range label="Sensitivity" value={settings.sensitivity} min={0.75} max={1.8} step={0.05} display={`${settings.sensitivity.toFixed(2)}×`} onChange={(v) => update('sensitivity', v)} />
        <Range label="Smoothing" value={settings.smoothing} min={0.08} max={0.5} step={0.02} display={`${Math.round(settings.smoothing * 100)}%`} onChange={(v) => update('smoothing', v)} />
        <Range label="Confidence" value={settings.confidenceThreshold} min={0.4} max={0.9} step={0.05} display={`${Math.round(settings.confidenceThreshold * 100)}%`} onChange={(v) => update('confidenceThreshold', v)} />
        <label className="setting-toggle setting-toggle--featured">
          <span>Voice actions<small>Select, draw, zoom, rename, or start an arrow</small></span>
          <input type="checkbox" checked={settings.voiceCommands} onChange={(event) => update('voiceCommands', event.target.checked)} />
          <i />
        </label>
        <label className="setting-toggle">
          <span>Pinch fallback<small>Optional camera-only click and drag</small></span>
          <input type="checkbox" checked={settings.pinchActions} onChange={(event) => update('pinchActions', event.target.checked)} />
          <i />
        </label>
        {settings.pinchActions && (
          <div className="pinch-fallback-settings">
            <Range label="Pinch threshold" value={settings.pinchThreshold} min={0.14} max={0.78} step={0.01} display={settings.pinchThreshold.toFixed(2)} onChange={(v) => update('pinchThreshold', v)} />
            <div className="pinch-training-row">
              <button onClick={onTrainPinch}><Icon name="hand" /> {pinchTrained ? 'Retrain pinch' : 'Train pinch'}</button>
              {pinchTrained && <button className="pinch-training-row__reset" onClick={onResetPinch}>Reset</button>}
              <span className={pinchTrained ? 'is-trained' : ''}>{pinchTrained ? 'Personal profile' : 'Improved default'}</span>
            </div>
            <Range label="Double pinch" value={settings.doublePinchMs} min={250} max={650} step={25} display={`${settings.doublePinchMs} ms`} onChange={(v) => update('doublePinchMs', v)} />
          </div>
        )}
        <label className="setting-toggle">
          <span>Mirror camera<small>Natural selfie movement</small></span>
          <input type="checkbox" checked={settings.mirrorX} onChange={(event) => update('mirrorX', event.target.checked)} />
          <i />
        </label>
        <label className="setting-toggle">
          <span>Camera preview<small>Show landmark skeleton</small></span>
          <input type="checkbox" checked={settings.showPreview} onChange={(event) => update('showPreview', event.target.checked)} />
          <i />
        </label>
        <label className="setting-toggle">
          <span>Debug panel<small>Coordinates and ratios</small></span>
          <input type="checkbox" checked={settings.showDebug} onChange={(event) => update('showDebug', event.target.checked)} />
          <i />
        </label>
      </section>

      <section className="inspector__section inspector__section--bottom">
        <span className="eyebrow">Canvas</span>
        <div className="zoom-controls">
          <button onClick={onZoomOut} aria-label="Zoom out"><Icon name="zoomOut" /></button>
          <button onClick={onResetZoom} aria-label="Reset zoom"><Icon name="fit" />100%</button>
          <button onClick={onZoomIn} aria-label="Zoom in"><Icon name="zoomIn" /></button>
        </div>
      </section>
    </aside>
  );
}
