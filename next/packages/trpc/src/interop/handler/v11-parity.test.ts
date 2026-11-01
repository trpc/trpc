import {
  createTRPCUntypedClient,
  httpBatchStreamLink,
  TRPCClientError,
} from '@trpc/client';
import {
  initTRPC,
  TRPCError,
  tracked as tracked11,
  type TRPCDefaultErrorShape,
} from '@trpc/server';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { getWSConnectionHandler } from '@trpc/server/adapters/ws';
import superjson from 'superjson';
import { createV11Handler } from '@trpc12/trpc/interop';
import { error, initTrpc, tracked, type AnyRouter } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

// The same router twice: once on v11's own server (`@trpc/server` 11), once
// on the interop. Every response must match byte for byte, but for the
// divergences listed in `known`.

interface Ctx {
  readonly finished: Array<string>;
}
const finished: Array<string> = [];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type V11Config = {
  transformer?: typeof superjson;
  errorFormatter?: (opts: {
    shape: TRPCDefaultErrorShape;
  }) => TRPCDefaultErrorShape;
};

const v11Router = (config: V11Config) => {
  const t = initTRPC.context<Ctx>().create({
    isDev: false,
    sse: { ping: { enabled: false } },
    ...(config as {}),
  });
  return t.router({
    greet: t.procedure
      .input(z.object({ name: z.string() }))
      .query((o) => `hello ${o.input.name}`),
    nothing: t.procedure.query(() => undefined),
    nul: t.procedure.query(() => null),
    date: t.procedure.query(() => new Date(0)),
    add: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation((o) => ({ id: 1, title: o.input.title })),
    missing: t.procedure.query(() => {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No post' });
    }),
    boom: t.procedure.query(() => {
      throw new Error('boom');
    }),
    report: t.procedure.query(() => ({
      title: 'Report',
      total: Promise.resolve(42),
    })),
    rejecting: t.procedure.query(() => ({
      title: 'R',
      total: Promise.reject(
        new TRPCError({ code: 'CONFLICT', message: 'Recount' }),
      ),
    })),
    nested: t.procedure.query(() => ({
      deeply: Promise.resolve({
        nested: Promise.resolve({ promise: Promise.resolve('foo') }),
      }),
    })),
    wait: t.procedure.input(z.object({ ms: z.number() })).query(async (o) => {
      await sleep(o.input.ms);
      return o.input.ms;
    }),
    rows: t.procedure.query(async function* () {
      yield 'a';
      yield 'b';
      return 'done';
    }),
    dates: t.procedure.query(async function* () {
      yield new Date(0);
      return new Date(1);
    }),
    failingRows: t.procedure.query(async function* () {
      yield 'a';
      throw new TRPCError({ code: 'CONFLICT', message: 'Gone' });
    }),
    endless: t.procedure.query(async function* (o) {
      try {
        for (let i = 0; ; i++) {
          yield i;
          await sleep(5);
        }
      } finally {
        o.ctx.finished.push('endless');
      }
    }),
    events: t.procedure.subscription(async function* () {
      yield 1;
      yield new Date(0);
    }),
    counted: t.procedure
      .input(z.object({ from: z.number() }))
      .subscription(async function* (o) {
        yield o.input.from;
      }),
    trackedEvents: t.procedure
      .input(z.object({ lastEventId: z.string().nullish() }).optional())
      .subscription(async function* (o) {
        const start = o.input?.lastEventId
          ? Number(o.input.lastEventId) + 1
          : 1;
        for (let i = start; i <= 3; i++) yield tracked11(String(i), { i });
      }),
    failing: t.procedure.subscription(async function* () {
      yield 1;
      throw new TRPCError({ code: 'CONFLICT', message: 'Gone' });
    }),
    idle: t.procedure.subscription(async function* (o) {
      try {
        yield 0;
        await new Promise((resolve) =>
          o.signal?.addEventListener('abort', resolve),
        );
      } finally {
        o.ctx.finished.push('idle');
      }
    }),
  });
};

const t = initTrpc<{ ctx: Ctx }>();
const v12Router = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query((o) => `hello ${o.input.name}`),
  nothing: t.procedure.query(() => undefined),
  nul: t.procedure.query(() => null),
  date: t.procedure.query(() => new Date(0)),
  add: t.procedure
    .input(z.object({ title: z.string() }))
    .mutation((o) => ({ id: 1, title: o.input.title })),
  missing: t.procedure.query(() =>
    error({ code: 'NOT_FOUND', message: 'No post' }),
  ),
  boom: t.procedure.query(() => {
    throw new Error('boom');
  }),
  report: t.procedure.query(() => ({
    title: 'Report',
    total: Promise.resolve(42),
  })),
  rejecting: t.procedure.query(() => ({
    title: 'R',
    total: Promise.reject(error({ code: 'CONFLICT', message: 'Recount' })),
  })),
  nested: t.procedure.query(() => ({
    deeply: Promise.resolve({
      nested: Promise.resolve({ promise: Promise.resolve('foo') }),
    }),
  })),
  wait: t.procedure.input(z.object({ ms: z.number() })).query(async (o) => {
    await sleep(o.input.ms);
    return o.input.ms;
  }),
  rows: t.procedure.query(async function* () {
    yield 'a';
    yield 'b';
    return 'done';
  }),
  dates: t.procedure.query(async function* () {
    yield new Date(0);
    return new Date(1);
  }),
  failingRows: t.procedure.query(async function* () {
    yield 'a';
    throw error({ code: 'CONFLICT', message: 'Gone' });
  }),
  endless: t.procedure.query(async function* (o) {
    try {
      for (let i = 0; ; i++) {
        yield i;
        await sleep(5);
      }
    } finally {
      o.ctx.finished.push('endless');
    }
  }),
  events: t.procedure.subscription(async function* () {
    yield 1;
    yield new Date(0);
  }),
  counted: t.procedure
    .input(z.object({ from: z.number() }))
    .subscription(async function* (o) {
      yield o.input.from;
    }),
  trackedEvents: t.procedure.subscription(async function* (o) {
    const start = o.lastEventId ? Number(o.lastEventId) + 1 : 1;
    for (let i = start; i <= 3; i++) yield tracked(String(i), { i });
  }),
  failing: t.procedure.subscription(async function* () {
    yield 1;
    throw error({ code: 'CONFLICT', message: 'Gone' });
  }),
  idle: t.procedure.subscription(async function* (o) {
    try {
      yield 0;
      await new Promise((resolve) =>
        o.signal.addEventListener('abort', resolve),
      );
    } finally {
      o.ctx.finished.push('idle');
    }
  }),
}) satisfies AnyRouter;

const custom = <S extends { data: object }>({ shape }: { shape: S }) => ({
  ...shape,
  data: { ...shape.data, custom: true },
});

const who = (failing: string | null | undefined) => {
  if (failing) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Who?' });
  return { finished };
};
const who12 = (failing: string | undefined) => {
  if (failing) throw error({ code: 'UNAUTHORIZED', message: 'Who?' });
  return { finished };
};

/** One configuration, on both servers. */
const pair = (
  config: V11Config & {
    allowBatching?: boolean;
    maxBatchSize?: number;
    allowMethodOverride?: boolean;
  },
) => {
  const router = v11Router(config);
  const interop = createV11Handler({
    router: v12Router,
    createContext: (o) => who12(o.request.headers['x-fail']),
    exposeUnexpectedErrors: true,
    sse: { pingInterval: false },
    ...(config.transformer ? { transformer: config.transformer } : {}),
    ...(config.errorFormatter ? { errorFormatter: custom } : {}),
    ...(config.allowBatching === false ? { batch: false } : {}),
    ...(config.maxBatchSize
      ? { batch: { maxItems: config.maxBatchSize } }
      : {}),
    ...(config.allowMethodOverride ? { allowMethodOverride: true } : {}),
  });
  return {
    v11: (request: Request) =>
      fetchRequestHandler({
        router,
        endpoint: '/trpc',
        req: request,
        createContext: (o) => who(o.req.headers.get('x-fail')),
        ...(config.allowBatching === false ? { allowBatching: false } : {}),
        ...(config.maxBatchSize ? { maxBatchSize: config.maxBatchSize } : {}),
        ...(config.allowMethodOverride ? { allowMethodOverride: true } : {}),
      }),
    v12: (request: Request) => interop.fetch(request),
  };
};

const setups = {
  plain: pair({}),
  superjson: pair({ transformer: superjson }),
  formatted: pair({ errorFormatter: custom }),
  unbatched: pair({ allowBatching: false }),
  capped: pair({ maxBatchSize: 1 }),
  override: pair({ allowMethodOverride: true }),
};
type Setup = keyof typeof setups;

type Line = [id: number, status: number, value: unknown];
type Encoded = [[unknown] | [], ...Array<[string | null, number, number]>];

/**
 * A JSON Lines body as the tree it resolves to. Ids and line order follow
 * which value settles first, so they are left out.
 */
interface Deferred {
  kind: 'promise' | 'iterable';
  settled: Array<unknown>;
}

const resolveJsonl = (body: string, deserialize: (v: unknown) => unknown) => {
  const [head, ...lines] = body
    .trimEnd()
    .split('\n')
    .map((line) => deserialize(JSON.parse(line)));
  const settled = new Map<number, Array<[number, unknown]>>();
  for (const [id, status, value] of lines as Line[]) {
    settled.set(id, [...(settled.get(id) ?? []), [status, value]]);
  }
  const decode = ([value, ...defs]: Encoded): unknown => {
    let out: unknown = value[0];
    for (const [key, kind, id] of defs) {
      const deferred: Deferred = {
        kind: kind === 0 ? 'promise' : 'iterable',
        settled: (settled.get(id) ?? []).map(([status, v]) =>
          (kind === 0 ? status === 1 : status === 2)
            ? { error: v }
            : { status, value: decode(v as Encoded) },
        ),
      };
      out = key === null ? deferred : { ...(out as object), [key]: deferred };
    }
    return out;
  };
  return Object.fromEntries(
    Object.entries(head as Record<string, Encoded>).map(([key, encoded]) => [
      key,
      decode(encoded),
    ]),
  );
};

const snapshot = async (
  res: Response,
  deserialize: (v: unknown) => unknown,
) => {
  const body = await res.text();
  const contentType = res.headers.get('content-type');
  return {
    status: res.status,
    contentType,
    vary: res.headers.get('vary'),
    cacheControl: res.headers.get('cache-control'),
    body:
      contentType === 'application/json' && body.endsWith('\n')
        ? resolveJsonl(body, deserialize)
        : body,
  };
};
type Snapshot = Awaited<ReturnType<typeof snapshot>>;

const q = (v: unknown) => encodeURIComponent(JSON.stringify(v));
const sj = (v: unknown) => q(superjson.serialize(v));
const jsonlHeaders: Record<string, string> = {
  'trpc-accept': 'application/jsonl',
};
const jsonl: RequestInit = { headers: jsonlHeaders };
const post = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const failingHeaders: Record<string, string> = { 'x-fail': '1' };
const failing: RequestInit = { headers: failingHeaders };

const cases: Array<[Setup, string, string, RequestInit?]> = [
  ['plain', 'query', `/greet?input=${q({ name: 'a' })}`],
  ['plain', 'undefined', `/nothing`],
  ['plain', 'null', `/nul`],
  ['plain', 'date', `/date`],
  ['plain', 'mutation', `/add`, post({ title: 'x' })],
  ['plain', 'no content-type', `/add`, { method: 'POST' }],
  ['plain', 'not found path', `/nope`],
  ['plain', 'thrown NOT_FOUND', `/missing`],
  ['plain', 'unexpected error', `/boom`],
  ['plain', 'bad input', `/greet?input=${q({ name: 1 })}`],
  ['plain', 'invalid json', `/greet?input={nope`],
  [
    'plain',
    'invalid json body',
    `/add`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    },
  ],
  ['plain', 'GET mutation', `/add`],
  ['plain', 'HEAD', `/greet`, { method: 'HEAD' }],
  ['plain', 'HEAD outside the endpoint', `/../nope`, { method: 'HEAD' }],
  ['plain', 'POST query', `/greet`, post({ name: 'a' })],
  [
    'plain',
    'text/plain',
    `/add`,
    { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' },
  ],
  ['plain', 'createContext fails', `/nothing`, failing],
  ['plain', 'createContext fails, batch', `/nothing,nul?batch=1`, failing],
  [
    'plain',
    'createContext fails, stream',
    `/nothing?batch=1`,
    {
      headers: { ...jsonlHeaders, ...failingHeaders },
    },
  ],
  ['plain', 'httpLink deferred', `/report`],
  ['plain', 'httpLink iterable', `/rows`],
  [
    'plain',
    'batch',
    `/greet,greet?batch=1&input=${q({ 0: { name: 'a' }, 1: { name: 'b' } })}`,
  ],
  [
    'plain',
    'batch 207',
    `/greet,missing?batch=1&input=${q({ 0: { name: 'a' } })}`,
  ],
  ['plain', 'batch all failing', `/missing,missing?batch=1`],
  ['plain', 'batch no input', `/nothing,nul?batch=1`],
  ['plain', 'batch scalar input', `/nothing,nul?batch=1&input=5`],
  ['plain', 'batch scalar input, read', `/greet?batch=1&input=5`],
  ['plain', 'batch mixed types', `/greet,add?batch=1`, post({})],
  ['plain', 'batch GET mutations', `/add,add?batch=1`],
  ['plain', 'batch subscriptions', `/events,events?batch=1`],
  ['plain', 'batch deferred', `/report?batch=1`],
  ['plain', 'batch iterable', `/rows?batch=1`],
  [
    'plain',
    'batch mutations',
    `/add,add?batch=1`,
    post({ 0: { title: 'a' }, 1: { title: 'b' } }),
  ],
  [
    'plain',
    'jsonl one',
    `/greet?batch=1&input=${q({ 0: { name: 'a' } })}`,
    jsonl,
  ],
  ['plain', 'jsonl two', `/nul,nothing?batch=1`, jsonl],
  ['plain', 'jsonl undefined', `/nothing?batch=1`, jsonl],
  ['plain', 'jsonl null', `/nul?batch=1`, jsonl],
  ['plain', 'jsonl error', `/missing?batch=1`, jsonl],
  [
    'plain',
    'jsonl bad input',
    `/greet?batch=1&input=${q({ 0: { name: 1 } })}`,
    jsonl,
  ],
  ['plain', 'jsonl not found', `/nope?batch=1`, jsonl],
  ['plain', 'jsonl deferred', `/report?batch=1`, jsonl],
  ['plain', 'jsonl rejecting deferred', `/rejecting?batch=1`, jsonl],
  ['plain', 'jsonl embedded promises', `/nested?batch=1`, jsonl],
  ['plain', 'jsonl rows', `/rows?batch=1`, jsonl],
  ['plain', 'jsonl failing rows', `/failingRows?batch=1`, jsonl],
  [
    'plain',
    'jsonl accept',
    `/nul?batch=1`,
    { headers: { accept: 'application/jsonl' } },
  ],
  ['plain', 'jsonl unbatched', `/nul`, jsonl],
  [
    'plain',
    'jsonl mutation',
    `/add?batch=1`,
    post({ 0: { title: 'a' } }, jsonlHeaders),
  ],
  ['plain', 'sse', `/events`],
  ['plain', 'sse tracked', `/trackedEvents`],
  [
    'plain',
    'sse lastEventId header',
    `/trackedEvents`,
    { headers: { 'last-event-id': '1' } },
  ],
  ['plain', 'sse lastEventId query', `/trackedEvents?lastEventId=2`],
  ['plain', 'sse failing', `/failing`],
  ['plain', 'sse bad input', `/counted?input=${q({ from: 'x' })}`],
  ['plain', 'sse POST', `/events`, post(undefined)],
  ['plain', 'sse createContext fails', `/events`, failing],
  ['plain', 'sse not found', `/nope`],
  ['superjson', 'superjson query', `/greet?input=${sj({ name: 'a' })}`],
  ['superjson', 'superjson undefined', `/nothing`],
  ['superjson', 'superjson date', `/date`],
  [
    'superjson',
    'superjson mutation',
    `/add`,
    post(superjson.serialize({ title: 'x' })),
  ],
  ['superjson', 'superjson error', `/missing`],
  ['superjson', 'superjson request error', `/greet,add?batch=1`, post({})],
  ['superjson', 'superjson batch', `/date,nothing?batch=1`],
  ['superjson', 'superjson jsonl', `/date,report?batch=1`, jsonl],
  ['superjson', 'superjson jsonl rows', `/dates?batch=1`, jsonl],
  ['superjson', 'superjson jsonl error', `/failingRows?batch=1`, jsonl],
  ['superjson', 'superjson sse', `/events`],
  ['superjson', 'superjson sse tracked', `/trackedEvents`],
  ['superjson', 'superjson sse error', `/failing`],
  ['formatted', 'formatted call error', `/missing`],
  ['formatted', 'formatted request error', `/greet,add?batch=1`, post({})],
  ['formatted', 'formatted jsonl error', `/failingRows?batch=1`, jsonl],
  ['formatted', 'formatted sse error', `/failing`],
  ['unbatched', 'batching disabled', `/nul?batch=1`],
  ['unbatched', 'batching disabled, stream', `/nul?batch=1`, jsonl],
  ['unbatched', 'batching disabled, single', `/nul`],
  ['capped', 'batch over the cap', `/nul,nul?batch=1`],
  ['capped', 'batch at the cap', `/nul?batch=1`],
  ['override', 'override POST query', `/greet`, post({ name: 'a' })],
  [
    'override',
    'override POST batch',
    `/greet?batch=1`,
    post({ 0: { name: 'a' } }),
  ],
  ['override', 'override GET mutation', `/add`],
  ['override', 'override POST subscription', `/events`, post(undefined)],
];

/**
 * Where the interop answers differently on purpose, and the fields that
 * differ. Each is asserted to still differ, so a fix shows up here.
 */
const known: Record<string, { fields: Array<keyof Snapshot>; why: string }> = {
  'bad input': {
    fields: ['body'],
    why: 'v12 validation errors say "Input validation failed"; v11 put the zod issues JSON in the message. `errorFormatter` can rebuild it from `error.data`.',
  },
  'jsonl bad input': {
    fields: ['body'],
    why: 'As "bad input".',
  },
  'sse bad input': {
    fields: ['body'],
    why: 'As "bad input".',
  },
  'no content-type': {
    fields: ['status', 'contentType', 'body'],
    why: 'A POST without a content-type is read as JSON, where v11 refused it with 415. v11 clients always send one.',
  },
  'text/plain': {
    fields: ['contentType', 'body'],
    why: 'v11 sends request-level errors as text/plain, and its message lacks the closing quote. Clients parse JSON either way.',
  },
  'batch mixed types': {
    fields: ['contentType'],
    why: 'v11 sends request-level errors as text/plain.',
  },
  'superjson request error': {
    fields: ['contentType'],
    why: 'As "batch mixed types".',
  },
  'formatted request error': {
    fields: ['contentType'],
    why: 'As "batch mixed types".',
  },
  'jsonl unbatched': {
    fields: ['contentType'],
    why: 'As "batch mixed types".',
  },
  'batching disabled': {
    fields: ['contentType'],
    why: 'As "batch mixed types".',
  },
  'batching disabled, stream': {
    fields: ['contentType'],
    why: 'As "batch mixed types".',
  },
  'batch over the cap': {
    fields: ['contentType'],
    why: 'As "batch mixed types".',
  },
  'httpLink deferred': {
    fields: ['status', 'body'],
    why: 'The JSON links get promises settled, where v11 refused them with 415: a router can return them to old and new clients alike.',
  },
  'batch deferred': {
    fields: ['status', 'body'],
    why: 'As "httpLink deferred".',
  },
  'batch scalar input': {
    fields: ['status', 'body'],
    why: 'v11 reads inputs lazily, so procedures without an input ignore a malformed one; the interop reads them once, before any call.',
  },
};

test.each(cases)('%s: %s', async (setup, name, path, init) => {
  const url = `http://localhost/trpc${path}`;
  const server = setups[setup];
  const deserialize =
    setup === 'superjson'
      ? (v: unknown) => superjson.deserialize(v as never)
      : (v: unknown) => v;
  const left = await snapshot(
    await server.v11(new Request(url, init)),
    deserialize,
  );
  const right = await snapshot(
    await server.v12(new Request(url, init)),
    deserialize,
  );
  const divergence = known[name];
  if (!divergence) {
    expect(right).toEqual(left);
    return;
  }
  const drop = (s: Snapshot) =>
    Object.fromEntries(
      Object.entries(s).filter(
        ([key]) => !divergence.fields.includes(key as keyof Snapshot),
      ),
    );
  expect(drop(right)).toEqual(drop(left));
  for (const field of divergence.fields) {
    expect(right[field]).not.toEqual(left[field]);
  }
});

test('every known divergence names a case', () => {
  const names = new Set(cases.map(([, name]) => name));
  expect(Object.keys(known).filter((name) => !names.has(name))).toEqual([]);
});

// v11's `streaming.test.ts`, through a v11 client against both servers.

/** In-process, but like `fetch`: aborting the signal errors the body. */
const inProcess =
  (handle: (r: Request) => Promise<Response>) =>
  async (input: unknown, init?: unknown) => {
    const signal = (init as RequestInit | undefined)?.signal;
    const res = await handle(new Request(input as string, init as RequestInit));
    if (!signal || !res.body) return res;
    const reader = res.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener(
          'abort',
          () => {
            controller.error(signal.reason);
            void reader.cancel(signal.reason);
          },
          { once: true },
        );
      },
      async pull(controller) {
        const chunk = await reader.read();
        if (signal.aborted) return;
        if (chunk.done) controller.close();
        else controller.enqueue(chunk.value);
      },
      cancel: (reason) => reader.cancel(reason),
    });
    return new Response(body, res);
  };

const client = (
  handle: (r: Request) => Promise<Response>,
  transformer?: typeof superjson,
) =>
  createTRPCUntypedClient<any>({
    links: [
      transformer
        ? httpBatchStreamLink({
            url: 'http://localhost/trpc',
            transformer,
            fetch: inProcess(handle),
          })
        : httpBatchStreamLink({
            url: 'http://localhost/trpc',
            fetch: inProcess(handle),
          }),
    ],
  });

const caught = async (run: () => Promise<void>): Promise<unknown> => {
  try {
    await run();
    return undefined;
  } catch (cause) {
    return cause;
  }
};

const servers = ['v11', 'v12'] as const;

test.each(servers)(
  '%s: out-of-order streaming keeps request order',
  async (side) => {
    const trpc = client(setups.plain[side]);
    const arrived: number[] = [];
    const results = await Promise.all(
      [30, 10, 20].map(async (ms) => {
        const value = (await trpc.query('wait', { ms })) as number;
        arrived.push(value);
        return value;
      }),
    );
    expect(results).toEqual([30, 10, 20]);
    expect(arrived).toEqual([10, 20, 30]);
  },
);

test.each(servers)('%s: iterable, with its return value', async (side) => {
  const trpc = client(setups.plain[side]);
  const iterable = (await trpc.query('rows')) as AsyncIterable<string>;
  const iterator = iterable[Symbol.asyncIterator]();
  const yielded: string[] = [];
  let r;
  while (!(r = await iterator.next()).done) yielded.push(r.value);
  expect(yielded).toEqual(['a', 'b']);
  expect(r.value).toBe('done');
});

test.each(servers)('%s: iterable with error', async (side) => {
  const trpc = client(setups.plain[side]);
  const iterable = (await trpc.query('failingRows')) as AsyncIterable<string>;
  const yielded: string[] = [];
  const err = await caught(async () => {
    for await (const value of iterable) yielded.push(value);
  });
  expect(yielded).toEqual(['a']);
  expect(err).toBeInstanceOf(TRPCClientError);
  expect(err).toMatchObject({ message: 'Gone', data: { code: 'CONFLICT' } });
});

test.each(servers)(
  '%s: iterable cancellation ends the generator',
  async (side) => {
    const trpc = client(setups.plain[side]);
    const ac = new AbortController();
    const before = finished.length;
    const iterable = (await trpc.query('endless', undefined, {
      signal: ac.signal,
    })) as AsyncIterable<number>;
    const yielded: number[] = [];
    const err = await caught(async () => {
      for await (const value of iterable) {
        yielded.push(value);
        if (value === 2) ac.abort();
      }
    });
    expect(yielded).toEqual([0, 1, 2]);
    expect(err).toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finished.length).toBe(before + 1));
  },
);

test.each(servers)('%s: embed promise', async (side) => {
  const trpc = client(setups.plain[side]);
  const result = (await trpc.query('nested')) as {
    deeply: Promise<{ nested: Promise<{ promise: Promise<string> }> }>;
  };
  expect(result.deeply).toBeInstanceOf(Promise);
  const deeply = await result.deeply;
  expect(deeply.nested).toBeInstanceOf(Promise);
  const nested = await deeply.nested;
  expect(await nested.promise).toBe('foo');
});

test.each(servers)('%s: with transformer, iterable of Dates', async (side) => {
  const trpc = client(setups.superjson[side], superjson);
  const iterable = (await trpc.query('dates')) as AsyncIterable<Date>;
  const iterator = iterable[Symbol.asyncIterator]();
  const first = await iterator.next();
  expect(first.value).toEqual(new Date(0));
  expect(await iterator.next()).toEqual({ done: true, value: new Date(1) });
});

test.each(servers)(
  '%s: with transformer, out-of-order streaming',
  async (side) => {
    const trpc = client(setups.superjson[side], superjson);
    expect(
      await Promise.all([
        trpc.query('wait', { ms: 20 }),
        trpc.query('date'),
        trpc.query('report'),
      ]),
    ).toMatchObject([20, new Date(0), { title: 'Report' }]);
  },
);

// WebSocket: the same messages to v11's `getWSConnectionHandler` and to the
// interop's `websocket()`. The replies to each id must match, but for the
// divergences listed in `wsKnown`.

/** The parts of a `ws` socket v11's handler uses. */
class WsSocket extends EventEmitter {
  readyState = 1;
  readonly sent: Array<unknown> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  receive(message: string) {
    this.emit('message', Buffer.from(message), false);
  }
}

/** A WHATWG socket, as `websocket()` takes it. */
class StandardSocket extends EventTarget {
  readyState = 1;
  readonly sent: Array<unknown> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  receive(message: string) {
    this.dispatchEvent(new MessageEvent('message', { data: message }));
  }
}

const wsPair = (config: V11Config & { maxBatchSize?: number }) => {
  const v11 = getWSConnectionHandler({
    router: v11Router(config),
    createContext: () => who(null),
    // Only `applyWSSHandler` reads it.
    wss: undefined as never,
  });
  const interop = createV11Handler({
    router: v12Router,
    createContext: (o) => who12(o.request.headers['x-fail']),
    exposeUnexpectedErrors: true,
    ...(config.transformer ? { transformer: config.transformer } : {}),
    ...(config.errorFormatter ? { errorFormatter: custom } : {}),
    ...(config.maxBatchSize
      ? { batch: { maxItems: config.maxBatchSize } }
      : {}),
  });
  return {
    v11: () => {
      const socket = new WsSocket();
      v11(
        socket as never,
        {
          url: '/trpc',
          headers: { host: 'localhost' },
        } as IncomingMessage,
      );
      return socket;
    },
    v12: () => {
      const socket = new StandardSocket();
      interop.websocket(socket, {
        request: new Request('http://localhost/trpc'),
      });
      return socket;
    },
  };
};

const wsSetups = {
  plain: wsPair({}),
  superjson: wsPair({ transformer: superjson }),
  formatted: wsPair({ errorFormatter: custom }),
  capped: wsPair({ maxBatchSize: 1 }),
};

/** Messages to send, then how many replies to wait for, in all. */
type WsStep = [messages: Array<unknown>, replies: number];

const call = (
  id: number,
  method: string,
  path: string,
  input?: unknown,
  extra: object = {},
) => ({ id, jsonrpc: '2.0', method, params: { path, input, ...extra } });

const wsCases: Array<[keyof typeof wsSetups, string, Array<WsStep>]> = [
  ['plain', 'ws query', [[[call(1, 'query', 'greet', { name: 'a' })], 1]]],
  ['plain', 'ws mutation', [[[call(1, 'mutation', 'add', { title: 'x' })], 1]]],
  ['plain', 'ws undefined', [[[call(1, 'query', 'nothing')], 1]]],
  ['plain', 'ws error', [[[call(1, 'query', 'missing')], 1]]],
  ['plain', 'ws unexpected error', [[[call(1, 'query', 'boom')], 1]]],
  ['plain', 'ws missing path', [[[call(1, 'query', 'nowhere')], 1]]],
  ['plain', 'ws wrong method', [[[call(1, 'mutation', 'greet')], 1]]],
  ['plain', 'ws bad input', [[[call(1, 'query', 'greet', { name: 1 })], 1]]],
  [
    'plain',
    'ws batch',
    [
      [
        [
          [
            call(1, 'query', 'greet', { name: 'a' }),
            call(2, 'mutation', 'add', { title: 'x' }),
          ],
        ],
        2,
      ],
    ],
  ],
  ['plain', 'ws subscription', [[[call(1, 'subscription', 'events')], 4]]],
  [
    'plain',
    'ws subscription with input',
    [[[call(1, 'subscription', 'counted', { from: 3 })], 3]],
  ],
  [
    'plain',
    'ws tracked, from lastEventId',
    [
      [
        [
          call(1, 'subscription', 'trackedEvents', undefined, {
            lastEventId: '1',
          }),
        ],
        4,
      ],
    ],
  ],
  [
    'plain',
    'ws subscription error',
    [[[call(1, 'subscription', 'failing')], 3]],
  ],
  [
    'plain',
    'ws subscription.stop',
    [
      [[call(1, 'subscription', 'idle')], 2],
      [[{ id: 1, jsonrpc: '2.0', method: 'subscription.stop' }], 3],
    ],
  ],
  [
    'plain',
    'ws unknown method',
    [[[{ id: 1, jsonrpc: '2.0', method: 'delete' }], 1]],
  ],
  ['plain', 'ws invalid JSON', [[['{nope'], 1]]],
  [
    'plain',
    'ws params not an object',
    [[[{ id: 1, jsonrpc: '2.0', method: 'query', params: 'nope' }], 1]],
  ],
  [
    'superjson',
    'ws superjson query',
    [[[call(1, 'query', 'date', superjson.serialize(undefined))], 1]],
  ],
  [
    'superjson',
    'ws superjson subscription',
    [[[call(1, 'subscription', 'events', superjson.serialize(undefined))], 4]],
  ],
  ['formatted', 'ws formatted error', [[[call(1, 'query', 'missing')], 1]]],
  [
    'capped',
    'ws batch over the cap',
    [[[[call(1, 'query', 'nul'), call(2, 'query', 'nul')]], 2]],
  ],
  ['capped', 'ws batch at the cap', [[[[call(1, 'query', 'nul')]], 1]]],
];

/** Where the interop answers differently on purpose. */
const wsKnown: Record<string, string> = {
  'ws bad input': 'As "bad input".',
  'ws unknown method':
    'v11 answers with id null and "Invalid procedure type"; the interop answers by id, with the method it got. v11 clients send only the methods they know.',
  'ws params not an object':
    'v11 answers with id null and "Not an object"; the interop answers by id, as a call to path "". v11 clients always send params.',
  'ws batch over the cap':
    "v11's sockets have no cap and run both calls; the interop refuses them with the error v11 sends for an HTTP batch over `maxBatchSize`, by id (compared below).",
  'ws invalid JSON':
    "v11's message is `JSON.parse`'s, which varies by runtime; the interop's is \"Invalid JSON\".",
};

/** Each id's replies, in the order they were sent. */
const byId = (sent: Array<unknown>) => {
  const replies = new Map<string, Array<unknown>>();
  for (const reply of sent) {
    const id = JSON.stringify((reply as { id?: unknown }).id ?? null);
    replies.set(id, [...(replies.get(id) ?? []), reply]);
  }
  return Object.fromEntries(replies);
};

test.each(wsCases)('%s: %s', async (setup, name, steps) => {
  const run = async (socket: WsSocket | StandardSocket) => {
    for (const [messages, replies] of steps) {
      for (const message of messages) {
        socket.receive(
          typeof message === 'string' ? message : JSON.stringify(message),
        );
      }
      await vi.waitFor(() =>
        expect(socket.sent.length).toBeGreaterThanOrEqual(replies),
      );
    }
    await sleep(20);
    socket.close();
    return byId(socket.sent);
  };
  const left = await run(wsSetups[setup].v11());
  const right = await run(wsSetups[setup].v12());
  if (wsKnown[name]) expect(right).not.toEqual(left);
  else expect(right).toEqual(left);
});

test("a WebSocket message over the cap fails each call with v11's error for an HTTP batch over maxBatchSize", async () => {
  const res = await setups.capped.v11(
    new Request('http://localhost/trpc/nul,nul?batch=1'),
  );
  const body = (await res.json()) as unknown;
  const v11Error = (
    (Array.isArray(body) ? body[0] : body) as { error: unknown }
  ).error;
  expect(v11Error).toMatchObject({
    message: 'Batch call exceeds maximum size',
    data: { code: 'BAD_REQUEST' },
  });
  const socket = wsSetups.capped.v12();
  socket.receive(
    JSON.stringify([call(1, 'query', 'nul'), call(2, 'query', 'nul')]),
  );
  await vi.waitFor(() => expect(socket.sent).toHaveLength(2));
  await sleep(20);
  socket.close();
  expect(socket.sent).toEqual([
    { id: 1, jsonrpc: '2.0', error: v11Error },
    { id: 2, jsonrpc: '2.0', error: v11Error },
  ]);
});

test('every known WebSocket divergence names a case', () => {
  const names = new Set(wsCases.map(([, name]) => name));
  expect(Object.keys(wsKnown).filter((name) => !names.has(name))).toEqual([]);
});
