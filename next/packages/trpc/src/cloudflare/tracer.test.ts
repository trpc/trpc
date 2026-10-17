import { AsyncLocalStorage } from 'node:async_hooks';
import { Effect } from 'effect';
import {
  experimental_workersTracer,
  type WorkersSpan,
  type WorkersTracing,
} from '@trpc12/trpc/cloudflare';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

interface Recorded {
  name: string;
  parent: string | undefined;
  attributes: Record<string, unknown>;
  status?: string;
  exception?: string | undefined;
  ended: boolean;
}

/** Workers Traces nests spans by async context, as this fake does. */
function fakeTracing(isTraced = true) {
  const active = new AsyncLocalStorage<Recorded>();
  const spans: Recorded[] = [];
  const tracing: WorkersTracing = {
    startActiveSpan(name, fn) {
      const record: Recorded = {
        name,
        parent: active.getStore()?.name,
        attributes: {},
        ended: false,
      };
      spans.push(record);
      const span: WorkersSpan = {
        isTraced,
        spanContext: () => ({
          traceId: 'a'.repeat(32),
          spanId: String(spans.length).padStart(16, '0'),
        }),
        setAttribute(key, value) {
          record.attributes[key] = value;
          return span;
        },
        setStatus(status) {
          record.status = status.code;
          return span;
        },
        recordException(e) {
          record.exception = e.message;
        },
        end() {
          record.ended = true;
        },
      };
      return active.run(record, () => fn(span));
    },
  };
  // A subrequest: Workers opens its span under whatever span is active.
  const subrequest = () =>
    tracing.startActiveSpan('fetch', (span) => {
      span.end();
      return Promise.resolve('ok');
    });
  const byName = (name: string) => spans.find((s) => s.name === name);
  return { tracing, spans, subrequest, byName };
}

const t = initTrpc();

function setup(snapshot: boolean) {
  const fake = fakeTracing();
  const router = {
    post: t.procedure.query(() =>
      Effect.gen(function* () {
        const body = yield* Effect.promise(fake.subrequest).pipe(
          Effect.withSpan('load', { attributes: { 'post.id': 7 } }),
        );
        return body;
      }),
    ),
    missing: t.procedure.query(() => error({ code: 'NOT_FOUND' })),
  };
  const handler = createFetchHandler({
    router,
    layer: experimental_workersTracer({
      tracing: fake.tracing,
      ...(snapshot && { snapshot: () => AsyncLocalStorage.snapshot() }),
    }),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch: (input, init) => handler.fetch(new Request(input, init)),
      }),
    ],
  });
  return { fake, client };
}

test('tRPC and Effect spans land in Workers Traces, nested as Effect nests them', async () => {
  const app = setup(true);
  const { fake } = app;
  expect(await app.client.post.query()).toBe('ok');
  const call = fake.spans.find((s) => s.name === 'trpc.post')!;
  expect(call).toMatchObject({ status: 'ok', ended: true });
  expect(call.attributes).toMatchObject({ 'rpc.system': 'trpc' });
  expect(fake.byName('load')).toMatchObject({
    parent: 'trpc.post',
    attributes: { 'post.id': 7 },
    ended: true,
  });
  expect(fake.byName('fetch')?.parent).toBe('load');
});

test('failures set an error status', async () => {
  const app = setup(true);
  await expect(app.client.missing.query()).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(app.fake.spans.find((s) => s.name === 'trpc.missing')).toMatchObject({
    status: 'error',
    ended: true,
  });
});

test('without a snapshot, spans are recorded but not nested', async () => {
  const app = setup(false);
  expect(await app.client.post.query()).toBe('ok');
  expect(app.fake.byName('load')).toMatchObject({ ended: true });
  expect(app.fake.byName('load')?.parent).toBeUndefined();
});

test('attributes of any type are recorded; non-Error failures and untraced spans too', async () => {
  const fake = fakeTracing(false);
  const circular: Record<string, unknown> = {};
  circular['self'] = circular;
  const router = {
    odd: t.procedure.query(() =>
      Effect.fail('plain').pipe(
        Effect.withSpan('odd', {
          attributes: {
            flag: true,
            big: 10n,
            list: [1, 2],
            nothing: undefined,
            circular,
          },
        }),
        Effect.orElseSucceed(() => 'recovered'),
      ),
    ),
  };
  const handler = createFetchHandler({
    router,
    layer: experimental_workersTracer({ tracing: fake.tracing }),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch: (input, init) => handler.fetch(new Request(input, init)),
      }),
    ],
  });
  expect(await client.odd.query()).toBe('recovered');
  expect(fake.byName('odd')).toMatchObject({
    status: 'error',
    exception: 'plain',
    attributes: {
      flag: true,
      big: '10',
      list: '[1,2]',
      nothing: 'undefined',
      circular: '[object Object]',
    },
  });
});
