import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { createTRPCNext } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import type { AppType } from 'next/dist/shared/lib/utils';
import React from 'react';

const FINITE_GC_TIME = 1_234;

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      foo: t.procedure.query(() => 'bar' as const),
    });
    const opts = testServerAndClientResource(appRouter);

    return opts;
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

async function runSsrAndCollectGcTimes(
  forceServerGcTimeInfinity: boolean,
  queryClient?: QueryClient,
): Promise<unknown[]> {
  const windowRef = (globalThis as any).window;
  delete (globalThis as any).window;

  const seenGcTimes: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalBuild = QueryCache.prototype.build as any;
  const buildSpy = vi
    .spyOn(QueryCache.prototype as any, 'build')
    .mockImplementation(function (this: QueryCache, ...args: any[]) {
      seenGcTimes.push(args[1]?.gcTime ?? args[1]?.cacheTime);
      return originalBuild.apply(this, args);
    });

  try {
    const trpc = createTRPCNext({
      config() {
        return {
          ...ctx.trpcClientOptions,
          ...(queryClient ? { queryClient } : {}),
        };
      },
      ssr: true,
      ssrPrepass,
      forceServerGcTimeInfinity,
    });

    const App: AppType = () => {
      trpc.foo.useQuery(undefined, {
        gcTime: FINITE_GC_TIME,
      });
      return null;
    };

    const Wrapped = trpc.withTRPC(App);
    await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    return seenGcTimes;
  } finally {
    buildSpy.mockRestore();
    (globalThis as any).window = windowRef;
  }
}

test('forceServerGcTimeInfinity=true forces gcTime to Infinity on server', async () => {
  const gcTimes = await runSsrAndCollectGcTimes(true);

  expect(gcTimes).toContain(Infinity);
  expect(gcTimes).not.toContain(FINITE_GC_TIME);
});

test('forceServerGcTimeInfinity=false keeps finite gcTime from query options', async () => {
  const gcTimes = await runSsrAndCollectGcTimes(false);

  expect(gcTimes).toContain(FINITE_GC_TIME);
});

test('forceServerGcTimeInfinity=true also works when user passes queryClient', async () => {
  const queryClient = new QueryClient();
  const gcTimes = await runSsrAndCollectGcTimes(true, queryClient);

  expect(gcTimes).toContain(Infinity);
  expect(gcTimes).not.toContain(FINITE_GC_TIME);
});
