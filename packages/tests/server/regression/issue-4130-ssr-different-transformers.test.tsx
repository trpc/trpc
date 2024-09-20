/* eslint-disable @typescript-eslint/ban-ts-comment */

import { routerToServerAndClientNew } from '../___testHelpers';
import type { DehydratedState } from '@tanstack/react-query';
import { createTRPCNext } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import { initTRPC } from '@trpc/server';
import type { CombinedDataTransformer } from '@trpc/server/unstable-core-do-not-import';
import { uneval } from 'devalue';
import { konn } from 'konn';
import type { AppType } from 'next/dist/shared/lib/utils';
import React from 'react';
import superjson from 'superjson';

// [...]

export const transformer: CombinedDataTransformer = {
  input: superjson,
  output: {
    serialize: (object) => {
      return uneval(object);
    },
    // This `eval` only ever happens on the **client**
    deserialize: (object) => eval(`(${object})`),
  },
};

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create({
      transformer,
    });
    const appRouter = t.router({
      foo: t.procedure.query(() => 'bar' as const),
    });
    const opts = routerToServerAndClientNew(appRouter, {
      transformer,
    });

    return opts;
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('withTRPC - SSR', async () => {
  // @ts-ignore
  const { window } = global;

  // @ts-ignore
  delete globalThis.window;

  const trpc = createTRPCNext({
    config() {
      return ctx.trpcClientOptions;
    },
    ssr: true,
    transformer,
    ssrPrepass,
  });

  const App: AppType = () => {
    const query = trpc.foo.useQuery();
    return <>{JSON.stringify(query.data ?? null)}</>;
  };

  const Wrapped = trpc.withTRPC(App);

  const props = (await Wrapped.getInitialProps!({
    AppTree: Wrapped,
    Component: <div />,
  } as any)) as Record<string, any>;

  const trpcState: DehydratedState = transformer.input.deserialize(
    props['pageProps'].trpcState,
  );

  const relevantData = trpcState.queries.map((it) => ({
    data: it.state.data,
    queryKey: it.queryKey,
  }));

  expect(relevantData).toMatchInlineSnapshot(`
    Array [
      Object {
        "data": "bar",
        "queryKey": Array [
          Array [
            "foo",
          ],
          Object {
            "type": "query",
          },
        ],
      },
    ]
  `);

  // @ts-ignore
  globalThis.window = window;
});
