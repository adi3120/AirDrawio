import { describe, expect, it } from 'vitest';
import { normalizeVoicePhrase, parseVoiceCommand, parseVoiceCommands } from './voiceCommandModel';

describe('voice command grammar', () => {
  it('normalizes punctuation and capitalization', () => {
    expect(normalizeVoicePhrase('  Select, AND Hold! ')).toBe('select and hold');
  });

  it.each([
    ['select', { type: 'click', button: 'left' }],
    ['left click', { type: 'click', button: 'left' }],
    ['right click', { type: 'click', button: 'right' }],
    ['hold', { type: 'hold', button: 'left' }],
    ['old', { type: 'hold', button: 'left' }],
    ['select and hold', { type: 'hold', button: 'left' }],
    ['right hold', { type: 'hold', button: 'right' }],
    ['release', { type: 'release' }],
    ['please', { type: 'release' }],
    ['select that shape', { type: 'selectShape' }],
    ['Rename', { type: 'rename' }],
    ['Done', { type: 'finishRename' }],
    ['Start Arrow', { type: 'startArrow' }],
    ['End Arrow', { type: 'finishArrow' }],
    ['Zoom', { type: 'startZoom' }],
    ['End Zoom', { type: 'endZoom' }],
    ['and zoom', { type: 'endZoom' }],
    ['Line Start', { type: 'startLine' }],
    ['edit text', { type: 'editText' }],
    ['Whisper', { type: 'startDictation' }],
    ['right shift', { type: 'stopDictation' }],
    ['copy', { type: 'copy' }],
    ['cut', { type: 'cut' }],
    ['paste here', { type: 'paste' }],
  ])('maps “%s” to the expected action', (phrase, expected) => {
    expect(parseVoiceCommand(phrase)).toEqual(expected);
  });

  it.each(['top', 'bottom', 'left', 'right'] as const)(
    'maps the %s connection-point command',
    (anchor) => {
      expect(parseVoiceCommand(`select ${anchor}`)).toEqual({
        type: 'selectAnchor',
        anchor,
      });
    },
  );

  it('supports tool and diagram commands without confusing them with clicks', () => {
    expect(parseVoiceCommand('select line')).toEqual({ type: 'tool', tool: 'arrow' });
    expect(parseVoiceCommand('connector arrow')).toEqual({ type: 'tool', tool: 'connector' });
    expect(parseVoiceCommand('add rectangle')).toEqual({ type: 'addShape', shape: 'rectangle' });
    expect(parseVoiceCommand('rectangle')).toEqual({ type: 'addShape', shape: 'rectangle' });
    expect(parseVoiceCommand('ellipse')).toEqual({ type: 'addShape', shape: 'ellipse' });
    expect(parseVoiceCommand('text')).toEqual({ type: 'addShape', shape: 'text' });
    expect(parseVoiceCommand('draw')).toEqual({ type: 'startDraw' });
    expect(parseVoiceCommand('put pen away')).toEqual({ type: 'endDraw' });
    expect(parseVoiceCommand('pan')).toEqual({ type: 'tool', tool: 'pan' });
    expect(parseVoiceCommand('undo')).toEqual({ type: 'undo' });
  });

  it('ignores ordinary dictation text in command mode', () => {
    expect(parseVoiceCommand('customer authentication service')).toBeNull();
    expect(parseVoiceCommand('the old architecture')).toBeNull();
    expect(parseVoiceCommand('please select the gateway')).toBeNull();
  });

  it('splits merged commands and collapses repeated attempts', () => {
    expect(parseVoiceCommands('cut paste')).toEqual([
      { type: 'cut' },
      { type: 'paste' },
    ]);
    expect(parseVoiceCommands('copy copy copy')).toEqual([{ type: 'copy' }]);
    expect(parseVoiceCommands('line start release')).toEqual([
      { type: 'startLine' },
      { type: 'release' },
    ]);
  });

  it('does not extract commands from an ordinary sentence', () => {
    expect(parseVoiceCommands('please copy the customer service box')).toEqual([]);
  });
});
