import { getServerAndReactClient } from '../__reactHelpers';
import { ignoreErrors } from '@trpc/server/__tests__/suppressLogs';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import { z } from 'zod';

const fixtureData = ['1', '2'];

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      post: t.router({
        list: t.procedure
          .input(
            z.object({
              cursor: z.number().default(0),
              foo: z.literal('bar').optional().default('bar'),
            }),
          )
          .query(({ input }) => {
            return {
              items: fixtureData.slice(input.cursor, input.cursor + 1),
              next:
                input.cursor + 1 > fixtureData.length
                  ? undefined
                  : input.cursor + 1,
            };
          }),
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('with input', async () => {
  const { client } = ctx;

  ignoreErrors(() => {
    client.post.list.useInfiniteQuery(
      { foo: 'bar' },
      {
        // @ts-expect-error can't return page data that doesn't match the output type
        placeholderData() {
          return {
            pageParams: [undefined],
            pages: [undefined],
          };
        },
        getNextPageParam(lastPage) {
          return lastPage.next;
        },
      },
    );

    client.post.list.useSuspenseInfiniteQuery(
      { foo: 'bar' },
      {
        // @ts-expect-error can't return page data that doesn't match the output type
        placeholderData() {
          return {
            pageParams: [undefined],
            pages: [undefined],
          };
        },
        getNextPageParam(lastPage) {
          return lastPage.next;
        },
      },
    );
  });
});

test('good placeholderData', () => {
  const { client } = ctx;

  ignoreErrors(() => {
    client.post.list.useInfiniteQuery(
      { foo: 'bar' },
      {
        placeholderData() {
          return {
            pageParams: [undefined],
            pages: [
              {
                items: ['1', '2', '3'],
              },
            ],
          };
        },
        getNextPageParam(lastPage) {
          return lastPage.next;
        },
      },
    );
  });
});
