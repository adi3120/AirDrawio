import type { VoiceAnchor } from '../drawio/DrawioController';
import type { PointerButton } from '../drawio/PointerEventBridge';
import type { DiagramTool, ShapeKind } from '../drawio/DrawioBridge';

export type VoiceCommand =
  | { type: 'click'; button: PointerButton }
  | { type: 'hold'; button: PointerButton }
  | { type: 'release' }
  | { type: 'selectShape' }
  | { type: 'selectAnchor'; anchor: VoiceAnchor }
  | { type: 'rename' }
  | { type: 'finishRename' }
  | { type: 'startArrow' }
  | { type: 'finishArrow' }
  | { type: 'startLine' }
  | { type: 'startZoom' }
  | { type: 'endZoom' }
  | { type: 'startDraw' }
  | { type: 'endDraw' }
  | { type: 'editText' }
  | { type: 'startDictation' }
  | { type: 'stopDictation' }
  | { type: 'tool'; tool: DiagramTool }
  | { type: 'addShape'; shape: ShapeKind }
  | { type: 'undo' | 'redo' | 'delete' | 'copy' | 'cut' | 'paste' | 'cancel' | 'zoomIn' | 'zoomOut' };

export function normalizeVoicePhrase(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  const phrase = normalizeVoicePhrase(transcript);
  if (!phrase) return null;

  if (/^(right shift|stop editing|stop dictation|finish editing)$/.test(phrase)) {
    return { type: 'stopDictation' };
  }
  if (/^(done|finish rename|save name|save rename)$/.test(phrase)) {
    return { type: 'finishRename' };
  }
  if (/^(start arrow|begin arrow|start connector|begin connector)$/.test(phrase)) {
    return { type: 'startArrow' };
  }
  if (/^(end arrow|finish arrow|complete arrow|attach arrow|connect here|end connector)$/.test(phrase)) {
    return { type: 'finishArrow' };
  }
  if (/^(end zoom|and zoom|stop zoom|finish zoom|exit zoom)$/.test(phrase)) {
    return { type: 'endZoom' };
  }
  if (/^(zoom|start zoom|begin zoom|zoom mode)$/.test(phrase)) {
    return { type: 'startZoom' };
  }
  if (/^(stop drawing|end drawing|finish drawing|end draw|put pen away|pen off)$/.test(phrase)) {
    return { type: 'endDraw' };
  }
  if (/^(draw|drawer|start draw|start drawing|drawing mode|air drawing|air pen|pen)$/.test(phrase)) {
    return { type: 'startDraw' };
  }
  if (/^(line start|start line|begin line)$/.test(phrase)) {
    return { type: 'startLine' };
  }
  if (/^(right hold|hold right|right click hold)$/.test(phrase)) {
    return { type: 'hold', button: 'right' };
  }
  // Chrome commonly hears the short command "hold" as "old". Keep the
  // correction exact-command-only so ordinary phrases containing "old" do
  // not press the pointer.
  if (/^(left hold|hold left|left click hold|select and hold|hold|old)$/.test(phrase)) {
    return { type: 'hold', button: 'left' };
  }
  // Likewise, "release" often arrives as the acoustically similar "please".
  if (/^(release|please|drop|drop it|let go|left release|right release)$/.test(phrase)) {
    return { type: 'release' };
  }
  if (/^(right click|click right)$/.test(phrase)) {
    return { type: 'click', button: 'right' };
  }
  if (/^(left click|click left)$/.test(phrase)) {
    return { type: 'click', button: 'left' };
  }

  const anchor = phrase.match(/^select (?:the )?(top|bottom|left|right)(?: point)?$/)?.[1] as VoiceAnchor | undefined;
  if (anchor) return { type: 'selectAnchor', anchor };

  if (/^(select that shape|select shape|choose that shape)$/.test(phrase)) {
    return { type: 'selectShape' };
  }
  if (/^(rename|rename box|rename shape|change name|change label)$/.test(phrase)) {
    return { type: 'rename' };
  }
  if (/^(edit text|edit label)$/.test(phrase)) {
    return { type: 'editText' };
  }
  if (/^(whisper|start whisper|start dictation)$/.test(phrase)) {
    return { type: 'startDictation' };
  }

  if (/^(select|click|choose|press)$/.test(phrase)) {
    return { type: 'click', button: 'left' };
  }
  if (/^(undo|go back)$/.test(phrase)) return { type: 'undo' };
  if (/^(redo|go forward)$/.test(phrase)) return { type: 'redo' };
  if (/^(delete|delete selection|remove selection)$/.test(phrase)) return { type: 'delete' };
  if (/^(copy|copy selection|copy that|duplicate)$/.test(phrase)) return { type: 'copy' };
  if (/^(cut|cut selection|cut that)$/.test(phrase)) return { type: 'cut' };
  if (/^(paste|paste here|insert copy)$/.test(phrase)) return { type: 'paste' };
  if (/^(cancel|never mind|cancel connector)$/.test(phrase)) return { type: 'cancel' };
  if (/^(zoom in|magnify)$/.test(phrase)) return { type: 'zoomIn' };
  if (/^(zoom out|zoom back)$/.test(phrase)) return { type: 'zoomOut' };

  if (/^(pointer|pointer tool|select pointer)$/.test(phrase)) {
    return { type: 'tool', tool: 'pointer' };
  }
  if (/^(line|line tool|select line)$/.test(phrase)) {
    return { type: 'tool', tool: 'arrow' };
  }
  if (/^(connector|connector tool|connector arrow|arrow|arrow tool|select connector)$/.test(phrase)) {
    return { type: 'tool', tool: 'connector' };
  }
  if (/^(pan|pan tool|hand tool)$/.test(phrase)) {
    return { type: 'tool', tool: 'pan' };
  }

  if (/^(add |create )?rectangle$/.test(phrase)) return { type: 'addShape', shape: 'rectangle' };
  if (/^(add |create )?(ellipse|circle)$/.test(phrase)) return { type: 'addShape', shape: 'ellipse' };
  if (/^(add |create )?text$/.test(phrase)) return { type: 'addShape', shape: 'text' };

  return null;
}

const SEQUENCE_PHRASES = [
  'select and hold',
  'right click',
  'left click',
  'right hold',
  'left hold',
  'start arrow',
  'end arrow',
  'line start',
  'end zoom',
  'zoom',
  'end drawing',
  'draw',
  'select',
  'hold',
  'release',
  'rename',
  'done',
  'rectangle',
  'ellipse',
  'text',
  'pan',
  'copy',
  'cut',
  'paste',
  'undo',
  'redo',
  'delete',
  'cancel',
] as const;

/**
 * Chrome sometimes joins separately spoken short commands into one final
 * transcript (for example "cut paste" or "copy copy copy"). Split only a
 * conservative list of canonical phrases, and only when the entire transcript
 * can be consumed, so normal speech never triggers a partial command.
 */
export function parseVoiceCommands(transcript: string): VoiceCommand[] {
  const direct = parseVoiceCommand(transcript);
  if (direct) return [direct];

  const phrase = normalizeVoicePhrase(transcript);
  if (!phrase) return [];
  const commands: VoiceCommand[] = [];
  let remaining = phrase;
  while (remaining) {
    const match = SEQUENCE_PHRASES.find((candidate) =>
      remaining === candidate || remaining.startsWith(`${candidate} `),
    );
    if (!match) return [];
    const command = parseVoiceCommand(match);
    if (!command) return [];
    const previous = commands.at(-1);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(command)) {
      commands.push(command);
    }
    remaining = remaining.slice(match.length).trimStart();
  }
  return commands;
}

/**
 * Restricted grammar used by the offline recognizer. Keeping this list small
 * makes short commands much faster and more accurate than free-form speech.
 * Free-form rename text is intentionally excluded because Wispr owns that
 * one workflow.
 */
export const LOCAL_VOICE_COMMAND_PHRASES = [
  'select',
  'select that shape',
  'select shape',
  'select top',
  'select bottom',
  'select left',
  'select right',
  'select top point',
  'select bottom point',
  'select left point',
  'select right point',
  'select and hold',
  'hold',
  'left hold',
  'right hold',
  'release',
  'drop',
  'let go',
  'left click',
  'right click',
  'rename',
  'rename box',
  'rename shape',
  'done',
  'finish rename',
  'start arrow',
  'end arrow',
  'finish arrow',
  'connect here',
  'line start',
  'start line',
  'zoom',
  'start zoom',
  'end zoom',
  'stop zoom',
  'zoom in',
  'zoom out',
  'draw',
  'start drawing',
  'stop drawing',
  'end drawing',
  'pointer',
  'line',
  'connector',
  'connector arrow',
  'arrow',
  'rectangle',
  'ellipse',
  'circle',
  'text',
  'pan',
  'copy',
  'cut',
  'paste',
  'undo',
  'redo',
  'delete',
  'cancel',
  'edit text',
  'right shift',
  'stop dictation',
] as const;

/**
 * A short command such as “zoom” can be the beginning of a different command
 * such as “zoom out”. Those prefixes get a slightly longer partial-result
 * debounce; commands without ambiguity fire almost immediately.
 */
export function isVoiceCommandPrefix(transcript: string): boolean {
  const phrase = normalizeVoicePhrase(transcript);
  const current = parseVoiceCommands(phrase);
  if (!phrase || current.length === 0) return false;
  const currentSignature = JSON.stringify(current);
  return LOCAL_VOICE_COMMAND_PHRASES.some((candidate) => {
    if (!candidate.startsWith(`${phrase} `)) return false;
    return JSON.stringify(parseVoiceCommands(candidate)) !== currentSignature;
  });
}
