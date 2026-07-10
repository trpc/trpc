import { testReactResource } from './__helpers';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import {
  createTRPCClient,
  httpBatchLink,
  type TRPCClientErrorLike,
} from '@trpc/client';
import type { inferRouterError } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import {
  createTRPCContext,
  type AnyTRPCQueryKey,
  type TRPCMutationKeyWithoutPrefix,
  type TRPCMutationKeyWithPrefix,
  type TRPCQueryKey,
  type TRPCQueryKeyWithoutPrefix,
  type TRPCQueryKeyWithPrefix,
} from '@trpc/tanstack-react-query';
import * as React from 'react';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

const testContext = (opts?: { keyPrefix?: string }) => {
  const t = initTRPC.create({
    errorFormatter(opts) {
      return { foo: 1, ...opts.shape };
    },
  });

  const appRouter = t.router({
    bluesky: {
      post: t.router({
        byId: t.procedure
          .input(
            z.object({
              id: z.string(),
            }),
          )
          .query(() => '__result' as const),
        create: t.procedure.mutation(() => '__mutationResult' as const),
      }),
    },
  });

  return testReactResource(appRouter, opts);
};

const testContextWithErrorShape = () => {
  const t = initTRPC.create({
    errorFormatter(opts) {
      return { foo: 1, ...opts.shape };
    },
  });

  const appRouter = t.router({
    bluesky: {
      post: t.router({
        byId: t.procedure
          .input(
            z.object({
              id: z.string(),
            }),
          )
          .query(() => '__result' as const),
        create: t.procedure.mutation(() => '__mutationResult' as const),
      }),
    },
  });

  return testReactResource(appRouter);
};

describe('get queryFilter', () => {
  test('gets various query filters', async () => {
    await using ctx = testContext();

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();

      expect(trpc.pathFilter()).toMatchInlineSnapshot(`
        Object {
          "queryKey": Array [],
        }
      `);
      expect(trpc.bluesky.pathFilter()).toMatchInlineSnapshot(`
        Object {
          "queryKey": Array [
            Array [
              "bluesky",
            ],
          ],
        }
      `);
      expect(trpc.bluesky.post.pathFilter()).toMatchInlineSnapshot(`
        Object {
          "queryKey": Array [
            Array [
              "bluesky",
              "post",
            ],
          ],
        }
      `);
      expect(trpc.bluesky.post.byId.pathFilter()).toMatchInlineSnapshot(`
        Object {
          "queryKey": Array [
            Array [
              "bluesky",
              "post",
              "byId",
            ],
          ],
        }
      `);
      expect(trpc.bluesky.post.byId.queryFilter({ id: '1' }))
        .toMatchInlineSnapshot(`
          Object {
            "queryKey": Array [
              Array [
                "bluesky",
                "post",
                "byId",
              ],
              Object {
                "input": Object {
                  "id": "1",
                },
                "type": "query",
              },
            ],
          }
        `);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });

  test('type inference for query filters', async () => {
    await using ctx = testContext();

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();
      const query = useQueryClient();

      const a = trpc.bluesky.post.byId.queryFilter(
        { id: '1' },
        {
          predicate(query) {
            const data = query.setData('__result');
            assertType<unknown>(data);
            assertType<readonly unknown[]>(query.queryKey);

            return true;
          },
        },
      );
      assertType<AnyTRPCQueryKey>(a.queryKey);

      const b = query.getQueryData(a.queryKey);
      assertType<'__result' | undefined>(b);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });
});

describe('get queryKey', () => {
  test('gets various query keys', async () => {
    await using ctx = testContext();

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();
      const query = useQueryClient();

      query.setQueryData(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
        '__result',
      );

      expect(trpc.pathKey()).toMatchInlineSnapshot(`Array []`);

      expect(trpc.bluesky.pathKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "bluesky",
          ],
        ]
      `);
      expect(trpc.bluesky.post.pathKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "bluesky",
            "post",
          ],
        ]
      `);
      expect(trpc.bluesky.post.byId.pathKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "bluesky",
            "post",
            "byId",
          ],
        ]
      `);
      expect(trpc.bluesky.post.byId.queryKey({ id: '1' }))
        .toMatchInlineSnapshot(`
          Array [
            Array [
              "bluesky",
              "post",
              "byId",
            ],
            Object {
              "input": Object {
                "id": "1",
              },
              "type": "query",
            },
          ]
        `);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });

  test('type inference for query keys', async () => {
    await using ctx = testContext();

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();
      const query = useQueryClient();

      const a = query.getQueryData(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
      );
      assertType<'__result' | undefined>(a);

      const b = query.setQueryData(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
        '__result',
      );
      assertType<'__result' | undefined>(b);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });

  test('type inference for getQueryState', async () => {
    await using ctx = testContext();

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();
      const query = useQueryClient();

      const a = query.getQueryState(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
      );
      assertType<'__result' | undefined>(a?.data);
      assertType<
        | TRPCClientErrorLike<{
            transformer: false;
            errorShape: inferRouterError<typeof ctx.router>;
          }>
        | null
        | undefined
      >(a?.error);

      const b = query.setQueryData(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
        '__result',
      );
      assertType<'__result' | undefined>(b);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });

  test('type inference for getQueryState with defined error shape', async () => {
    await using ctx = testContextWithErrorShape();

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();
      const query = useQueryClient();

      const a = query.getQueryState(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
      );
      assertType<'__result' | undefined>(a?.data);
      assertType<
        | TRPCClientErrorLike<{
            transformer: false;
            errorShape: inferRouterError<typeof ctx.router>;
          }>
        | null
        | undefined
      >(a?.error);

      const b = query.setQueryData(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
        '__result',
      );
      assertType<'__result' | undefined>(b);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });
});

describe('get queryKey with a prefix', () => {
  test('gets various query keys', async () => {
    await using ctx = testContext({
      keyPrefix: 'user-123',
    });

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();
      const query = useQueryClient();

      query.setQueryData(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
        '__result',
      );

      expect(trpc.pathKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "user-123",
          ],
        ]
      `);

      expect(trpc.bluesky.pathKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "user-123",
          ],
          Array [
            "bluesky",
          ],
        ]
      `);
      expect(trpc.bluesky.post.pathKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "user-123",
          ],
          Array [
            "bluesky",
            "post",
          ],
        ]
      `);
      expect(trpc.bluesky.post.byId.pathKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "user-123",
          ],
          Array [
            "bluesky",
            "post",
            "byId",
          ],
        ]
      `);
      expect(trpc.bluesky.post.byId.queryKey({ id: '1' }))
        .toMatchInlineSnapshot(`
          Array [
            Array [
              "user-123",
            ],
            Array [
              "bluesky",
              "post",
              "byId",
            ],
            Object {
              "input": Object {
                "id": "1",
              },
              "type": "query",
            },
          ]
        `);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });
});

describe('get mutationKey', () => {
  test('gets various mutation keys', async () => {
    await using ctx = testContext();

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();

      // @ts-expect-error - not a mutation
      trpc.bluesky.post.byId.mutationKey;
      // @ts-expect-error - not a mutation
      trpc.bluesky.mutationKey;

      expect(trpc.bluesky.post.create.mutationKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "bluesky",
            "post",
            "create",
          ],
        ]
      `);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });
});

describe('get mutationKey with prefix', () => {
  test('gets various mutation keys', async () => {
    await using ctx = testContext({
      keyPrefix: 'user-123',
    });

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();

      // @ts-expect-error - not a mutation
      trpc.bluesky.post.byId.mutationKey;
      // @ts-expect-error - not a mutation
      trpc.bluesky.mutationKey;

      expect(trpc.bluesky.post.create.mutationKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "user-123",
          ],
          Array [
            "bluesky",
            "post",
            "create",
          ],
        ]
      `);

      return 'some text';
    }

    ctx.renderApp(<Component />);
  });
});

test('types of testReactResource', async () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    q: t.procedure.query(() => 'query'),
    m: t.procedure.mutation(() => 'mutation'),
  });

  {
    const prefix = 'user-123';
    await using ctx = testReactResource(appRouter, {
      keyPrefix: prefix,
    });

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();
      {
        const key = trpc.q.pathKey();

        expectTypeOf<typeof key>().toEqualTypeOf<TRPCQueryKeyWithPrefix>();
        expect(key).toEqual([[prefix], ['q']]);
      }

      {
        const key = trpc.m.mutationKey();
        expectTypeOf<typeof key>().toEqualTypeOf<TRPCMutationKeyWithPrefix>();
        expect(key).toEqual([[prefix], ['m']]);
      }
      return null;
    }
    ctx.renderApp(<Component />);
  }
  {
    await using ctx = testReactResource(appRouter);

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();
      {
        const key = trpc.q.pathKey();

        expectTypeOf<typeof key>().toEqualTypeOf<TRPCQueryKeyWithoutPrefix>();
        expect(key).toEqual([['q']]);
      }
      {
        const key = trpc.m.mutationKey();
        expectTypeOf<
          typeof key
        >().toEqualTypeOf<TRPCMutationKeyWithoutPrefix>();
        expect(key).toEqual([['m']]);
      }
      return null;
    }
    ctx.renderApp(<Component />);
  }
});

test('types of normal usage', async () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    q: t.procedure.query(() => 'query'),
    m: t.procedure.mutation(() => 'mutation'),
  });

  {
    const { TRPCProvider } = createTRPCContext<typeof appRouter>();
    function Component() {
      const [queryClient] = useState(() => new QueryClient());
      const [trpcClient] = useState(() =>
        createTRPCClient<typeof appRouter>({
          links: [
            httpBatchLink({
              url: 'http://localhost:3000',
            }),
          ],
        }),
      );

      return (
        <>
          <TRPCProvider
            //
            queryClient={queryClient}
            trpcClient={trpcClient}
          >
            {null}
          </TRPCProvider>

          <TRPCProvider
            //
            queryClient={queryClient}
            trpcClient={trpcClient}
            // @ts-expect-error - test
            keyPrefix="test"
          >
            {null}
          </TRPCProvider>
        </>
      );
    }
  }

  {
    const { TRPCProvider } = createTRPCContext<
      typeof appRouter,
      { keyPrefix: true }
    >();
    function Component() {
      const [queryClient] = useState(() => new QueryClient());
      const [trpcClient] = useState(() =>
        createTRPCClient<typeof appRouter>({
          links: [
            httpBatchLink({
              url: 'http://localhost:3000',
            }),
          ],
        }),
      );

      return (
        <>
          {/* @ts-expect-error - test keyPrefix */}
          <TRPCProvider
            //
            queryClient={queryClient}
            trpcClient={trpcClient}
          >
            {null}
          </TRPCProvider>

          <TRPCProvider
            //
            queryClient={queryClient}
            trpcClient={trpcClient}
            keyPrefix="test"
          >
            {null}
          </TRPCProvider>
        </>
      );
    }
  }
});
