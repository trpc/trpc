import { getServerAndReactClient } from './__helpers';
import { useQueryClient } from '@tanstack/react-query';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { AssertType, describe, expect, test } from 'vitest';
import { z } from 'zod';

const testContext = () => {
  let iterableDeferred = createDeferred<void>();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = createDeferred();
  };
  const t = initTRPC.create({});

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

  return Object.assign(getServerAndReactClient(appRouter), { nextIterable });
};

describe('get queryFilter', () => {
  test('gets various query filters', async () => {
    await using ctx = testContext();

    const { useTRPC } = ctx;

    function Component() {
      const trpc = useTRPC();

      expect(trpc.queryFilter()).toMatchInlineSnapshot(`
        Object {
          "queryKey": Array [],
        }
      `);
      expect(trpc.bluesky.queryFilter()).toMatchInlineSnapshot(`
        Object {
          "queryKey": Array [
            Array [
              "bluesky",
            ],
          ],
        }
      `);
      expect(trpc.bluesky.post.queryFilter()).toMatchInlineSnapshot(`
        Object {
          "queryKey": Array [
            Array [
              "bluesky",
              "post",
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
              },
            ],
          }
        `);

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

      const a = query.getQueryData(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
      );
      query.setQueryData(
        trpc.bluesky.post.byId.queryKey({ id: '1' }),
        '__result',
      );

      expect(trpc.queryKey()).toMatchInlineSnapshot(`Array []`);
      expect(trpc.bluesky.queryKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "bluesky",
          ],
        ]
      `);
      expect(trpc.bluesky.post.queryKey()).toMatchInlineSnapshot(`
        Array [
          Array [
            "bluesky",
            "post",
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
