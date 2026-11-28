import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';
import { createTRPCClient } from '../createTRPCClient';
import type { TRPCProcedureOptions } from '../internals/types';
import { routerType } from '../routerType';
import { httpBatchLink } from './httpBatchLink';
import { httpLink } from './httpLink';
import { httpSubscriptionLink } from './httpSubscriptionLink';
import { createChain } from './internals/createChain';
import { localLink } from './localLink';
import { retryLink } from './retryLink';
import { splitLink } from './splitLink';
import type { OperationLink, TRPCLink } from './types';

test('splitLink', () => {
  const wsLinkSpy = vi.fn();
  const wsLink: TRPCLink<any> = () => () =>
    observable(() => {
      wsLinkSpy();
    });
  const httpLinkSpy = vi.fn();
  const httpLink: TRPCLink<any> = () => () =>
    observable(() => {
      httpLinkSpy();
    });
  const links: OperationLink<AnyRouter, any, any>[] = [
    // "dedupe link"
    splitLink({
      condition(op) {
        return op.type === 'subscription';
      },
      true: wsLink,
      false: [httpLink],
    })(null as any),
  ];

  createChain({
    links,
    op: {
      type: 'query',
      input: null,
      path: '.',
      id: 0,
      context: {},
      signal: null,
    },
  }).subscribe({});
  expect(httpLinkSpy).toHaveBeenCalledTimes(1);
  expect(wsLinkSpy).toHaveBeenCalledTimes(0);
  vi.resetAllMocks();

  createChain({
    links,
    op: {
      type: 'subscription',
      input: null,
      path: '.',
      id: 0,
      context: {},
      signal: null,
    },
  }).subscribe({});
  expect(httpLinkSpy).toHaveBeenCalledTimes(0);
  expect(wsLinkSpy).toHaveBeenCalledTimes(1);
});

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

test('splitLink takes the context both branches read', () => {
  const split = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: httpSubscriptionLink({ url: 'http://localhost' }),
        false: [
          retryLink({ retry: () => true }),
          httpBatchLink({ url: 'http://localhost' }),
        ],
      }),
    ],
  });
  void (() => {
    // the condition may read anything; the branches' fields stay typed
    void split.flaky.query('a', {
      context: { skipBatch: true, retry: () => false },
    });
    // @ts-expect-error -- `retry` takes a function
    void split.flaky.query('a', { context: { retry: 1 } });
  });
});

test('splitLink’s `context` defaults declare what `condition` reads', async () => {
  const { appRouter } = factory();
  const url = 'http://localhost';
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        context: { skipBatch: false },
        condition: (op) => {
          expectTypeOf(op.context.skipBatch).toEqualTypeOf<boolean>();
          return op.context.skipBatch;
        },
        true: httpLink({ url }),
        false: httpBatchLink({ url }),
      }),
    ],
  });
  expectTypeOf<
    ContextOf<typeof client.flaky.query>['skipBatch']
  >().toEqualTypeOf<boolean | undefined>();
  void (() => {
    void client.flaky.query('a', { context: { skipBatch: true } });
    // @ts-expect-error -- `skipBatch` is a boolean
    void client.flaky.query('a', { context: { skipBatch: 'yes' } });
  });

  // only `condition` reads a context here
  const seen: unknown[] = [];
  const local = localLink({
    router: appRouter,
    createContext: async () => ({}),
  });
  const strict = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        context: { useCache: false },
        condition: (op) => {
          seen.push(op.context.useCache);
          return op.context.useCache;
        },
        true: local,
        false: local,
      }),
    ],
  });
  expectTypeOf<ContextOf<typeof strict.flaky.query>>().toEqualTypeOf<{
    useCache?: boolean;
  }>();
  void (() => {
    // @ts-expect-error -- no link reads `nope`
    void strict.flaky.query('a', { context: { nope: 1 } });
  });

  // a field the call leaves out takes its default
  await strict.flaky.query('a').catch(() => null);
  await strict.flaky
    .query('b', { context: { useCache: undefined } })
    .catch(() => null);
  await strict.flaky
    .query('c', { context: { useCache: true } })
    .catch(() => null);
  expect(seen).toEqual([false, false, true]);
});

test('a symbol-keyed `context` field takes its default only when left out', async () => {
  const { appRouter } = factory();
  const useCache = Symbol('useCache');
  const seen: unknown[] = [];
  const local = localLink({
    router: appRouter,
    createContext: async () => ({}),
  });
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        context: { [useCache]: false },
        condition: (op) => {
          seen.push(op.context[useCache]);
          return op.context[useCache];
        },
        true: local,
        false: local,
      }),
    ],
  });

  await client.flaky.query('a').catch(() => null);
  await client.flaky
    .query('b', { context: { [useCache]: true } })
    .catch(() => null);
  expect(seen).toEqual([false, true]);
});
