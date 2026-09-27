export type WisprAction = 'start' | 'stop';

interface WisprResponse {
  ok: boolean;
  error?: string;
  code?: string;
  executable?: string;
}

export class WisprBridgeError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly executable?: string,
  ) {
    super(message);
    this.name = 'WisprBridgeError';
  }
}

export async function triggerWisprHotkey(
  action: WisprAction,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const abort = new AbortController();
  const timeout = window.setTimeout(() => abort.abort(), 5_000);
  try {
    const response = await fetcher('/api/wispr-hotkey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
      signal: abort.signal,
    });
    const result = await response.json().catch(() => ({ ok: false })) as WisprResponse;
    if (!response.ok || !result.ok) {
      throw new WisprBridgeError(
        result.error ?? 'The Wispr native hotkey bridge is unavailable.',
        result.code,
        result.executable,
      );
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The Wispr native hotkey bridge timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function openAccessibilitySettings(fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher('/api/open-accessibility-settings', { method: 'POST' });
  const result = await response.json().catch(() => ({ ok: false })) as WisprResponse;
  if (!response.ok || !result.ok) {
    throw new WisprBridgeError(result.error ?? 'Could not open Accessibility settings.');
  }
}
