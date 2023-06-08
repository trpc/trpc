import { ignoreErrors } from '../../___testHelpers';
import { getServerAndReactClient } from '../__reactHelpers';
import { initTRPC } from '@trpc/server/src';
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
    const { proxy } = ctx;

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData() {
          return {
            barbaz: null,
          };
        },
      });
    });

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData() {
          return 123;
        },
      });
    });

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        placeholderData: {
          // @ts-expect-error can't return data that doesn't match the output type
          barbaz: null,
        },
      });
    });

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        placeholderData: 123,
      });
    });
  });

  test('good placeholderData does not typeerror', () => {
    const { proxy } = ctx;

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        placeholderData() {
          return {
            posts: [],
            foo: 'bar',
          };
        },
      });
    });

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
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
    const { proxy } = ctx;

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData() {
          return {
            barbaz: null,
          };
        },
      });
    });

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData() {
          return 123;
        },
      });
    });

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        initialData: {
          // @ts-expect-error can't return data that doesn't match the output type
          barbaz: null,
        },
      });
    });

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        // @ts-expect-error can't return data that doesn't match the output type
        initialData: 123,
      });
    });
  });

  test('good initialData does not typeerror', () => {
    const { proxy } = ctx;

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        initialData() {
          return {
            posts: [],
            foo: 'bar',
          };
        },
      });
    });

    ignoreErrors(() => {
      proxy.post.list.useQuery(undefined, {
        initialData: {
          posts: [],
          foo: 'bar',
        },
      });
    });
  });
});
