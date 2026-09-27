import type { DiagramTool, ShapeKind } from '../drawio/DrawioBridge';
import { Icon, type IconName } from './Icon';

interface ToolButton {
  id: DiagramTool | ShapeKind;
  label: string;
  shortcut?: string;
  icon: IconName;
  kind: 'mode' | 'shape';
}

const tools: ToolButton[] = [
  { id: 'pointer', label: 'Pointer', shortcut: 'V', icon: 'pointer', kind: 'mode' },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: 'rectangle', kind: 'shape' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: 'ellipse', kind: 'shape' },
  { id: 'arrow', label: 'Line', shortcut: 'A', icon: 'arrow', kind: 'mode' },
  { id: 'connector', label: 'Connector Arrow', shortcut: 'C', icon: 'connector', kind: 'mode' },
  { id: 'text', label: 'Text', shortcut: 'T', icon: 'text', kind: 'shape' },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: 'hand', kind: 'mode' },
];

interface GestureToolbarProps {
  activeTool: DiagramTool;
  gestureMode: boolean;
  listening: boolean;
  onTool(tool: DiagramTool): void;
  onShape(kind: ShapeKind): void;
  onUndo(): void;
  onRedo(): void;
  onVoice(): void;
}

export function GestureToolbar({
  activeTool,
  gestureMode,
  listening,
  onTool,
  onShape,
  onUndo,
  onRedo,
  onVoice,
}: GestureToolbarProps) {
  return (
    <aside className={`tool-rail ${gestureMode ? 'is-gesture-mode' : ''}`} aria-label="Diagram tools">
      <div className="tool-rail__group">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool-button ${tool.kind === 'mode' && activeTool === tool.id ? 'is-active' : ''}`}
            onClick={() =>
              tool.kind === 'mode'
                ? onTool(tool.id as DiagramTool)
                : onShape(tool.id as ShapeKind)
            }
            title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            aria-label={tool.label}
            aria-pressed={tool.kind === 'mode' ? activeTool === tool.id : undefined}
          >
            <Icon name={tool.icon} />
            <span>{tool.label}</span>
            {tool.shortcut && <kbd>{tool.shortcut}</kbd>}
          </button>
        ))}
      </div>
      <div className="tool-rail__separator" />
      <div className="tool-rail__group tool-rail__group--compact">
        <button className="tool-button" onClick={onUndo} title="Undo (⌘Z)" aria-label="Undo">
          <Icon name="undo" />
          <span>Undo</span>
        </button>
        <button className="tool-button" onClick={onRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
          <Icon name="redo" />
          <span>Redo</span>
        </button>
      </div>
      <div className="tool-rail__spacer" />
      <button
        className={`tool-button tool-button--voice ${listening ? 'is-listening' : ''}`}
        onClick={onVoice}
        aria-label={listening ? 'Stop listening' : 'Label selected shape with voice'}
      >
        <Icon name="mic" />
        <span>{listening ? 'Listening' : 'Voice'}</span>
        <i />
      </button>
    </aside>
  );
}
