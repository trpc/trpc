import { createV11Handler } from '@trpc12/trpc/interop';
import {
  experimental_createMcpHandler,
  experimental_mcp,
} from '@trpc12/trpc/mcp';
import {
  experimental_createOpenApiHandler,
  experimental_openapi,
} from '@trpc12/trpc/openapi';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const MiB = 1024 * 1024;

const t = initTrpc().concat(experimental_openapi()).concat(experimental_mcp());
const router = t.router({
  echo: t.procedure
    .meta({ route: { method: 'POST', path: '/echo' } })
    .input(z.unknown())
    .mutation(() => 'ok'),
});

interface Served extends AsyncDisposable {
  fetch: (request: Request) => Promise<Response>;
}
interface Case {
  url: string;
  /** The body, with `pad` somewhere in it. */
  body: (pad: string) => unknown;
  make: (opts: { maxBodySize?: number }) => Served;
}

const cases: Record<string, Case> = {
  createFetchHandler: {
    url: 'http://localhost/trpc/echo',
    body: (pad) => ({ json: pad }),
    make: (opts) => createFetchHandler({ router, ...opts }),
  },
  createV11Handler: {
    url: 'http://localhost/trpc/echo',
    body: (pad) => pad,
    make: (opts) => createV11Handler({ router, batch: false, ...opts }),
  },
  experimental_createOpenApiHandler: {
    url: 'http://localhost/echo',
    body: (pad) => pad,
    make: (opts) =>
      experimental_createOpenApiHandler({ router, prefix: '/', ...opts }),
  },
  experimental_createMcpHandler: {
    url: 'http://localhost/mcp',
    body: (pad) => ({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad } }),
    make: (opts) => experimental_createMcpHandler({ router, ...opts }),
  },
};

/** A JSON body of exactly `bytes` bytes, streamed without a `content-length`. */
const post = (c: Case, bytes: number) => {
  const pad = 'x'.repeat(bytes - JSON.stringify(c.body('')).length);
  return new Request(c.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(c.body(pad)),
  });
};

test.each(Object.entries(cases))(
  '%s: bodies have no size limit by default',
  async (_, c) => {
    await using handler = c.make({});
    expect((await handler.fetch(post(c, 20 * MiB))).status).toBe(200);
  },
);

test.each(Object.entries(cases))(
  '%s: maxBodySize caps bodies when set',
  async (_, c) => {
    await using handler = c.make({ maxBodySize: 2 * MiB });
    expect((await handler.fetch(post(c, 2 * MiB))).status).toBe(200);
    expect((await handler.fetch(post(c, 2 * MiB + 1))).status).toBe(413);
  },
);
