import { getServerAndReactClient } from '../__reactHelpers';
import { ignoreErrors } from '@trpc/server/__tests__/suppressLogs';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

/**
 * For reference,
 * @see https://github.com/trpc/trpc/issues/4486
 */

const fixtureData = ['1', '2'];

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      post: t.router({
        list: t.procedure.query(() => ({
          posts: fixtureData,
          foo: 'bar' as const,
        })),
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

describe('placeholderData', async () => {
  test('invalid placeholderData should typeerror', () => {
    const { client } = ctx;

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData() {
          return {
            barbaz: null,
          };
        },
      });

      client.post.list.useSuspenseQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData() {
          return {
            barbaz: null,
          };
        },
      });
    });

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData() {
          return 123;
        },
      });
      client.post.list.useSuspenseQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData() {
          return 123;
        },
      });
    });

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        placeholderData: {
          // @ts-expect-error can't return data that doesn't match the output type
          barbaz: null,
        },
      });
    });

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData: 123,
      });
      client.post.list.useSuspenseQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData: 123,
      });
    });
  });

  test('good placeholderData does not typeerror', () => {
    const { client } = ctx;

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        placeholderData() {
          return {
            posts: [],
            foo: 'bar',
          };
        },
      });
    });

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        placeholderData: {
          posts: [],
          foo: 'bar',
        },
      });
    });
  });
});

describe('initialData', async () => {
  test('invalid initialData should typeerror', () => {
    const { client } = ctx;

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData() {
          return {
            barbaz: null,
          };
        },
      });
      client.post.list.useSuspenseQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData() {
          return {
            barbaz: null,
          };
        },
      });
    });

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData() {
          return 123;
        },
      });
      client.post.list.useSuspenseQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData() {
          return 123;
        },
      });
    });

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        initialData: {
          // @ts-expect-error can't return data that doesn't match the output type
          barbaz: null,
        },
      });
      client.post.list.useSuspenseQuery(undefined, {
        initialData: {
          // @ts-expect-error can't return data that doesn't match the output type
          barbaz: null,
        },
      });
    });

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData: 123,
      });
      client.post.list.useSuspenseQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData: 123,
      });
    });
  });

  test('good initialData does not typeerror', () => {
    const { client } = ctx;

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        initialData() {
          return {
            posts: [],
            foo: 'bar',
          };
        },
      });
      client.post.list.useSuspenseQuery(undefined, {
        initialData() {
          return {
            posts: [],
            foo: 'bar',
          };
        },
      });
    });

    ignoreErrors(() => {
      client.post.list.useQuery(undefined, {
        initialData: {
          posts: [],
          foo: 'bar',
        },
      });
      client.post.list.useSuspenseQuery(undefined, {
        initialData: {
          posts: [],
          foo: 'bar',
        },
      });
    });
  });
});
