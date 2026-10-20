import { Schema } from 'effect';
import {
  createTrpcClient,
  ERROR_STATUS,
  httpLink,
  isTrpcError,
  routerType,
  type AnyTrpcError,
} from '@trpc12/trpc/client';
import {
  createFetchHandler,
  error,
  initTrpc,
  TrpcError,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { closedLink, matchError, safeClosed } from './closed.ts';

const t = initTrpc();
const deployed = {
  ok: t.procedure.query(() => 'ok'),
  missing: t.procedure
    .input(Schema.Struct({ id: Schema.String }))
    .query((opts) => error({ code: 'NOT_FOUND', data: { id: opts.input.id } })),
  boom: t.procedure.query(() => {
    throw new Error('connection refused: 10.0.0.7:5432');
  }),
  outOfStock: t.procedure.query(() => {
    throw new TrpcError({ code: 'OUT_OF_STOCK' });
  }),
  conflict: t.procedure.query(() => {
    throw new TrpcError({ code: 'CONFLICT' });
  }),
};
const latest = { ...deployed, added: t.procedure.query(() => 'new') };

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function setup(opts: { fetch?: (handler: Fetch) => Fetch; closed?: boolean }) {
  const handler = createFetchHandler({ router: deployed });
  const direct: Fetch = (input, init) =>
    handler.fetch(new Request(input, init));
  const http = httpLink({
    url: 'http://localhost/trpc',
    fetch: opts.fetch ? opts.fetch(direct) : direct,
  });
  const client = createTrpcClient({
    router: routerType<typeof latest>(),
    links: opts.closed ? [closedLink(), http] : [http],
  });
  return { client, [Symbol.asyncDispose]: () => handler.dispose() };
}

const html =
  (status: number): Fetch =>
  async () =>
    new Response('<html>upstream</html>', {
      status,
      headers: { 'content-type': 'text/html' },
    });

const scenarios = {
  'returned NOT_FOUND': { call: 'missing' },
  'thrown Error': { call: 'boom' },
  'thrown custom code': { call: 'outOfStock' },
  'thrown built-in code': { call: 'conflict' },
  'procedure the server lacks': { call: 'added' },
  'fetch rejects': {
    call: 'ok',
    fetch: () => async () => {
      throw new TypeError('fetch failed');
    },
  },
  aborted: { call: 'ok', abort: true },
  'proxy 401': { call: 'ok', fetch: () => html(401) },
  'proxy 502': { call: 'ok', fetch: () => html(502) },
  'proxy 520': { call: 'ok', fetch: () => html(520) },
  'older server version': {
    call: 'ok',
    fetch:
      (next: Fetch): Fetch =>
      (input, init) => {
        const request = new Request(input, init);
        request.headers.set('trpc-version', '11');
        return next(request);
      },
  },
} satisfies Record<
  string,
  {
    call: keyof typeof latest;
    fetch?: (handler: Fetch) => Fetch;
    abort?: boolean;
  }
>;

async function failure(
  name: keyof typeof scenarios,
  closed: boolean,
): Promise<AnyTrpcError> {
  const scenario: (typeof scenarios)[keyof typeof scenarios] & {
    fetch?: (handler: Fetch) => Fetch;
    abort?: boolean;
  } = scenarios[name];
  await using app = setup({
    ...(scenario.fetch ? { fetch: scenario.fetch } : {}),
    closed,
  });
  const controller = new AbortController();
  if (scenario.abort) controller.abort();
  const procedure = app.client[scenario.call] as {
    query: (
      input?: unknown,
      opts?: { signal?: AbortSignal },
    ) => Promise<unknown>;
  };
  const input = scenario.call === 'missing' ? { id: '1' } : undefined;
  const result = await safeClosed(
    procedure.query(input, { signal: controller.signal }),
  );
  if (!isTrpcError(result.error)) throw new Error(`${name} did not fail`);
  return result.error;
}

const census = async (closed: boolean) => {
  const rows: Record<string, string> = {};
  for (const name of Object.keys(scenarios) as (keyof typeof scenarios)[]) {
    const err = await failure(name, closed);
    rows[name] = `${err.code}${err.defined ? ' (defined)' : ''}`;
  }
  return rows;
};

test('what a call fails with, over httpLink', async () => {
  expect(await census(false)).toEqual({
    'returned NOT_FOUND': 'NOT_FOUND (defined)',
    'thrown Error': 'INTERNAL_SERVER_ERROR',
    'thrown custom code': 'OUT_OF_STOCK',
    'thrown built-in code': 'CONFLICT',
    'procedure the server lacks': 'NOT_FOUND',
    'fetch rejects': 'NETWORK_ERROR',
    aborted: 'CLIENT_CLOSED_REQUEST',
    'proxy 401': 'UNAUTHORIZED',
    'proxy 502': 'BAD_GATEWAY',
    'proxy 520': 'BAD_RESPONSE',
    'older server version': 'UNSUPPORTED_PROTOCOL',
  });
});

test('closedLink leaves only defined errors and built-in codes', async () => {
  const rows = await census(true);
  expect(rows['thrown custom code']).toBe('INTERNAL_SERVER_ERROR');
  const codes = Object.values(rows).map((row) => row.split(' ')[0]!);
  expect(codes.every((code) => code in ERROR_STATUS)).toBe(true);
});

test('matchError dispatches defined codes by name and the rest to unexpected', async () => {
  await using app = setup({ closed: true });
  const describe = async (call: Promise<unknown> & { '~error'?: unknown }) => {
    const result = await safeClosed(
      call as ReturnType<typeof app.client.missing.query>,
    );
    return result.error
      ? matchError(result.error, {
          NOT_FOUND: (err) => `no post ${err.data.id}`,
          BAD_REQUEST: (err) => `bad input: ${err.message}`,
          NETWORK_ERROR: () => 'offline',
          BAD_RESPONSE: () => 'unreadable',
          unexpected: (err) => `unexpected ${err.code}`,
        })
      : 'ok';
  };
  expect(await describe(app.client.missing.query({ id: '7' }))).toBe(
    'no post 7',
  );
  expect(await describe(app.client.outOfStock.query())).toBe(
    'unexpected INTERNAL_SERVER_ERROR',
  );
  expect(await describe(app.client.added.query())).toBe('unexpected NOT_FOUND');
});
