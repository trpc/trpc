import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const flightClient = createRequire(import.meta.url)(
  'react-server-dom-turbopack/client',
) as {
  createFromNodeStream: (
    stream: Readable,
    manifest: { moduleMap: object; serverModuleMap: null; moduleLoading: null },
  ) => Promise<unknown>;
};

test("an action's results survive React's Server Action serialization", async () => {
  const server = spawn(
    process.execPath,
    [
      '--conditions',
      'react-server',
      fileURLToPath(new URL('../fixtures/flight.ts', import.meta.url)),
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const exited = new Promise((resolve) => server.once('exit', resolve));
  const decoded = await flightClient.createFromNodeStream(server.stdout, {
    moduleMap: {},
    serverModuleMap: null,
    moduleLoading: null,
  });
  expect(await exited).toBe(0);
  expect(decoded).toStrictEqual({
    signed: {
      data: {
        message: 'Hello',
        at: new Date('2026-10-18T00:00:00.000Z'),
        by: 'ada',
      },
    },
    missing: {
      error: {
        code: 'NOT_FOUND',
        message: 'NOT_FOUND',
        data: { id: 'p1' },
        defined: true,
      },
    },
    invalid: {
      error: {
        code: 'BAD_REQUEST',
        message: 'Input validation failed',
        data: {
          issues: [expect.objectContaining({ path: ['message'] })],
        },
        defined: true,
      },
    },
    masked: {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        defined: false,
      },
    },
    // What `safe()`'s tuple-and-object result arrives as.
    dual: [1, undefined],
  });
});
