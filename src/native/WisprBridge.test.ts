import { describe, expect, it, vi } from 'vitest';
import { openAccessibilitySettings, triggerWisprHotkey, WisprBridgeError } from './WisprBridge';

describe('triggerWisprHotkey', () => {
  it('sends only the requested start action to the local bridge', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await triggerWisprHotkey('start', fetcher as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith('/api/wispr-hotkey', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'start' }),
    }));
  });

  it('surfaces native bridge failures', async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({
        ok: false,
        error: 'Accessibility permission is required.',
        code: 'ACCESSIBILITY_REQUIRED',
        executable: '/opt/homebrew/bin/node',
      }),
      { status: 500 },
    ));

    const error = await triggerWisprHotkey('stop', fetcher as typeof fetch).catch((cause) => cause);
    expect(error).toBeInstanceOf(WisprBridgeError);
    expect(error).toMatchObject({
      message: 'Accessibility permission is required.',
      code: 'ACCESSIBILITY_REQUIRED',
      executable: '/opt/homebrew/bin/node',
    });
  });

  it('opens the fixed macOS Accessibility settings endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await openAccessibilitySettings(fetcher as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith('/api/open-accessibility-settings', { method: 'POST' });
  });
});
