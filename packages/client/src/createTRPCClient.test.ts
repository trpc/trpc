import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { TRPCClient } from './createTRPCClient';
import { createTRPCClient } from './createTRPCClient';
import type { TRPCProcedureOptions } from './internals/types';
import { httpBatchLink } from './links/httpBatchLink';
import { httpLink } from './links/httpLink';
import { localLink } from './links/localLink';
import { loggerLink } from './links/loggerLink';
import { retryLink } from './links/retryLink';
import type { NoLinkReadsContext, TRPCLink } from './links/types';
import { routerType } from './routerType';

type ContextOf<TMethod> = TMethod extends (
  input: any,
  opts?: TRPCProcedureOptions<infer $Context>,
) => any
  ? $Context
  : never;

function factory() {
  const flakyCalls = vi.fn();
  const t = initTRPC.create();
  const appRouter = t.router({
    flaky: t.procedure.input(z.string()).query((opts) => {
      flakyCalls();
      if (flakyCalls.mock.calls.length === 1) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
      return opts.input;
    }),
    onEvent: t.procedure.subscription(async function* () {
      yield 1;
    }),
  });
  return { appRouter, flakyCalls };
}
type AppRouter = ReturnType<typeof factory>['appRouter'];

test('calls take the context their links declare', () => {
  const { appRouter } = factory();
  // a declared field is optional even when declared as required, since a
  // call can leave out its options
  const traceLink: TRPCLink<AppRouter, { context: { traceId: string } }> =
    () => (opts) => {
      expectTypeOf(opts.op.context).toEqualTypeOf<Record<string, unknown>>();
      return opts.next(opts.op);
    };
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      traceLink,
      localLink({ router: appRouter, createContext: async () => ({}) }),
    ],
  });

  expectTypeOf<ContextOf<typeof client.flaky.query>>().toEqualTypeOf<{
    traceId?: string;
  }>();
  expectTypeOf(client).toExtend<TRPCClient<AppRouter>>();

  void (() => {
    void client.flaky.query('a');
    void client.flaky.query('a', { context: { traceId: '1' } });
    // @ts-expect-error -- no link reads `nope`
    void client.flaky.query('a', { context: { nope: 1 } });
    // @ts-expect-error -- `traceId` is a string
    void client.flaky.query('a', { context: { traceId: 1 } });
  });
});

test('no context when no link reads one', () => {
  const { appRouter } = factory();
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [localLink({ router: appRouter, createContext: async () => ({}) })],
  });
  expectTypeOf<
    ContextOf<typeof client.flaky.query>
  >().toEqualTypeOf<NoLinkReadsContext>();

  void (() => {
    void client.flaky.query('a', { context: {} });
    // @ts-expect-error -- no link reads `foo`
    void client.flaky.query('a', { context: { foo: 1 } });
  });
});

test('links that give the operation to a callback may read any context', () => {
  // `headers({ op })`, `eventSourceOptions({ op })`, `enabled(op)` and
  // `retry({ op })` are user code that can read any field
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      loggerLink({
        enabled: (opts) =>
          opts.direction === 'down' || opts.context['skipLog'] !== true,
      }),
      retryLink({ retry: () => true }),
      httpLink({
        url: 'http://localhost',
        headers: ({ op }) => ({ authorization: String(op.context['token']) }),
      }),
    ],
  });
  void (() => {
    void client.flaky.query('a', {
      context: { token: 't', skipLog: true, retry: () => false },
    });
    // @ts-expect-error -- declared fields stay typed
    void client.flaky.query('a', { context: { retry: true } });
  });
});

test('a link that declares nothing may read any context', () => {
  const legacyLink: TRPCLink<AppRouter> = () => (opts) => opts.next(opts.op);
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      legacyLink,
      retryLink({ retry: () => true }),
      httpBatchLink({ url: 'http://localhost' }),
    ],
  });
  void (() => {
    void client.flaky.query('a', {
      context: { anything: 1, retry: () => false },
    });
    // @ts-expect-error -- declared fields stay typed
    void client.flaky.query('a', { context: { retry: 1 } });
  });

  // so does an inline link with no type at all
  const inline = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      () =>
        ({ op, next }) =>
          next(op),
      localLink({
        router: factory().appRouter,
        createContext: async () => ({}),
      }),
    ],
  });
  void (() => {
    void inline.flaky.query('a', { context: { traceId: '1' } });
  });

  // and a `links` array typed as `TRPCLink<AppRouter>[]`
  const links: TRPCLink<AppRouter>[] = [
    httpBatchLink({ url: 'http://localhost' }),
  ];
  const fromArray = createTRPCClient({
    router: routerType<AppRouter>(),
    links,
  });
  void (() => {
    void fromArray.flaky.query('a', { context: { anything: 1 } });
    fromArray.onEvent.subscribe(undefined, {});
  });
});

test('the client still fits where integrations take TRPCClient<AppRouter>', () => {
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      retryLink({ retry: () => true }),
      httpBatchLink({ url: 'http://localhost' }),
    ],
  });
  expectTypeOf(client).toExtend<TRPCClient<AppRouter>>();

  const noContext = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      localLink({
        router: factory().appRouter,
        createContext: async () => ({}),
      }),
    ],
  });
  expectTypeOf(noContext).toExtend<TRPCClient<AppRouter>>();
});

test('the type argument form keeps taking any context', () => {
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: 'http://localhost' })],
  });
  expectTypeOf(client).toEqualTypeOf<TRPCClient<AppRouter>>();
  void (() => {
    void client.flaky.query('a', { context: { anything: 1 } });
    client.onEvent.subscribe(undefined, {});
  });
});

test('a context no link reads still fits where any context is taken', () => {
  // procedures and handles typed by each are compared both ways, e.g. a
  // server-side proxy (`Record<string, unknown>`) against a client's
  expectTypeOf<NoLinkReadsContext>().toExtend<Record<string, unknown>>();
  expectTypeOf<Record<string, unknown>>().toExtend<NoLinkReadsContext>();
});
