import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import { z } from 'zod';

describe('basic', async () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();

      class PostService {
        public allPosts = t.procedure.query(() => {
          return [
            {
              id: 1,
              title: 'hello world',
            },
          ];
        });
      }
      class RootService {
        public post;
        constructor() {
          this.post = t.unstable_toRouter(new PostService());
        }

        public commonMethod() {
          return 'i am a shared method but not exposed to the client as a procedure';
        }

        public greeting = t.procedure
          .input(
            z.object({
              name: z.string().nullish(),
            }),
          )
          .query(({ input }) => {
            return {
              text: `hello ${input?.name ?? 'world'}`,
              // Try calling class method
              commonMethodResult: this.commonMethod(),
            };
          });
      }

      const appRouter = t.unstable_toRouter(new RootService());

      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();
  test('should work', async () => {
    const result = await ctx.proxy.greeting.query({ name: 'bob' });
    expect(result).toMatchInlineSnapshot();
  });
});
