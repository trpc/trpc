import { getServerAndReactClient } from './__helpers';
import { render } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import * as React from 'react';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
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

    const testHelpers = getServerAndReactClient(appRouter);

    return {
      ...testHelpers,
      nextIterable,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

describe('get queryFilter', () => {
  test('gets various query filters', () => {
    const { useTRPC } = ctx;

    function Heck() {
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

      return 'heck';
    }

    render(
      <ctx.App>
        <Heck />
      </ctx.App>,
    );
  });
});

describe('get queryKey', () => {
  test('gets various query keys', () => {
    const { useTRPC } = ctx;

    function Heck() {
      const trpc = useTRPC();

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

      return 'heck';
    }

    render(
      <ctx.App>
        <Heck />
      </ctx.App>,
    );
  });
});

describe('get mutationKey', () => {
  test('gets various mutation keys', () => {
    const { useTRPC } = ctx;

    function Heck() {
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

      return 'heck';
    }

    render(
      <ctx.App>
        <Heck />
      </ctx.App>,
    );
  });
});
