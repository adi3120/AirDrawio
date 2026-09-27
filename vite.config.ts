import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const WISPR_ENDPOINT = '/api/wispr-hotkey';
const ACCESSIBILITY_SETTINGS_ENDPOINT = '/api/open-accessibility-settings';
const execFileAsync = promisify(execFile);
const projectRoot = dirname(fileURLToPath(import.meta.url));
const nativeSource = resolve(projectRoot, 'native/wispr_hotkey.cc');
const nativeOutputDirectory = resolve(projectRoot, '.airdrawio-native');
const nativeOutput = resolve(nativeOutputDirectory, 'wispr_hotkey.node');
const requireNative = createRequire(import.meta.url);

interface WisprNativeAddon {
  isTrusted(): boolean;
  promptForTrust(): boolean;
  tapFn(taps: 1 | 2): boolean;
}

let nativeAddonPromise: Promise<WisprNativeAddon> | null = null;

async function loadWisprNativeAddon(): Promise<WisprNativeAddon> {
  if (nativeAddonPromise) return nativeAddonPromise;
  nativeAddonPromise = (async () => {
    await mkdir(nativeOutputDirectory, { recursive: true });
    const [sourceStats, outputStats] = await Promise.all([
      stat(nativeSource),
      stat(nativeOutput).catch(() => null),
    ]);
    if (!outputStats || outputStats.mtimeMs < sourceStats.mtimeMs) {
      const nodeInclude = resolve(dirname(process.execPath), '../include/node');
      await execFileAsync('/usr/bin/xcrun', [
        'clang++',
        '-std=c++17',
        '-bundle',
        '-undefined',
        'dynamic_lookup',
        '-I',
        nodeInclude,
        '-framework',
        'ApplicationServices',
        nativeSource,
        '-o',
        nativeOutput,
      ], { timeout: 30_000 });
    }
    return requireNative(nativeOutput) as WisprNativeAddon;
  })();
  return nativeAddonPromise;
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function wisprNativeBridge(): Plugin {
  let lastTriggerAt = 0;

  return {
    name: 'airdrawio-wispr-native-bridge',
    configureServer(server) {
      server.middlewares.use(ACCESSIBILITY_SETTINGS_ENDPOINT, (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }
        if (!isAllowedOrigin(request.headers.origin)) {
          response.statusCode = 403;
          response.end(JSON.stringify({ ok: false, error: 'Origin is not allowed.' }));
          return;
        }
        execFile(
          '/usr/bin/open',
          ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'],
          { timeout: 4_000 },
          (error) => {
            response.setHeader('Content-Type', 'application/json');
            response.statusCode = error ? 500 : 200;
            response.end(JSON.stringify(error
              ? { ok: false, error: 'Could not open Accessibility settings.' }
              : { ok: true }));
          },
        );
      });

      server.middlewares.use(WISPR_ENDPOINT, (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }

        const origin = request.headers.origin;
        if (!isAllowedOrigin(origin)) {
          response.statusCode = 403;
          response.end(JSON.stringify({ ok: false, error: 'Origin is not allowed.' }));
          return;
        }

        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 1024) request.destroy();
        });
        request.on('end', () => {
          void (async () => {
          let action: unknown;
          try {
            action = (JSON.parse(body) as { action?: unknown }).action;
          } catch {
            response.statusCode = 400;
            response.end(JSON.stringify({ ok: false, error: 'Invalid request.' }));
            return;
          }

          if (action !== 'start' && action !== 'stop') {
            response.statusCode = 400;
            response.end(JSON.stringify({ ok: false, error: 'Unsupported Wispr action.' }));
            return;
          }
          if (process.platform !== 'darwin') {
            response.statusCode = 501;
            response.end(JSON.stringify({ ok: false, error: 'Wispr hotkeys require macOS.' }));
            return;
          }

          const now = Date.now();
          if (now - lastTriggerAt < 450) {
            response.statusCode = 429;
            response.end(JSON.stringify({ ok: false, error: 'Wispr hotkey is already being sent.' }));
            return;
          }
          lastTriggerAt = now;

          const taps: 1 | 2 = action === 'start' ? 2 : 1;
          try {
            const addon = await loadWisprNativeAddon();
            if (!addon.isTrusted()) {
              addon.promptForTrust();
              response.statusCode = 500;
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify({
                ok: false,
                code: 'ACCESSIBILITY_REQUIRED',
                executable: process.execPath,
                error: 'macOS blocked the Wispr hotkey. Enable Terminal in Accessibility, start AirDrawio from Terminal, then say “Rename” again.',
              }));
              return;
            }
            addon.tapFn(taps);
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ok: true, action, taps }));
          } catch (error) {
            const nativeError = error as Error & { code?: string };
            response.statusCode = 500;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({
              ok: false,
              code: nativeError.code ?? 'NATIVE_BRIDGE_FAILED',
              error: `The native Wispr bridge failed: ${nativeError.message}`,
            }));
          }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), wisprNativeBridge()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
