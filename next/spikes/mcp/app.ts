import { experimental_openapi } from '@trpc12/trpc/openapi';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { z } from 'zod';
import { mcp } from './mcp.ts';

export interface Ctx {
  user: { name: string; admin: boolean } | null;
}

const t = initTrpc<{ ctx: Ctx }>().concat(experimental_openapi()).concat(mcp());

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Sign in first' }),
);

const Post = z.object({
  id: z.string(),
  title: z.string(),
  at: z.date(),
});

export const posts = new Map<string, z.infer<typeof Post>>();
export const freshPosts = (): Disposable => {
  posts.clear();
  posts.set('1', { id: '1', title: 'Hello', at: new Date(0) });
  return { [Symbol.dispose]: () => posts.clear() };
};

export const appRouter = {
  post: {
    byId: t.procedure
      .meta({
        mcp: { description: 'Read one blog post by its id.' },
        route: { method: 'GET', path: '/posts/{id}' },
      })
      .input(z.object({ id: z.string().describe('The post id, e.g. "1"') }))
      .output(Post)
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .query(({ input }) => {
        const post = posts.get(input.id);
        return post ?? error({ code: 'NOT_FOUND', data: { id: input.id } });
      }),
    count: t.procedure
      .meta({
        mcp: true,
        route: { summary: 'Count posts', description: 'How many posts exist.' },
      })
      .output(z.number())
      .query(() => posts.size),
    search: t.procedure
      .meta({ mcp: { description: 'Titles containing a word.' } })
      .input(z.string().min(1))
      .query(({ input }) =>
        [...posts.values()]
          .filter((post) => post.title.includes(input))
          .map((post) => post.title),
      ),
    create: authed
      .meta({ mcp: { description: 'Publish a post as the signed-in user.' } })
      .input(z.object({ title: z.string().min(3) }))
      .output(Post)
      .mutation(({ input }) => {
        const post = {
          id: String(posts.size + 1),
          title: input.title,
          at: new Date(0),
        };
        posts.set(post.id, post);
        return post;
      }),
    delete: authed
      .meta({
        mcp: {
          title: 'Delete a post',
          annotations: { destructiveHint: true, idempotentHint: true },
        },
      })
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        posts.delete(input.id);
      }),
    crash: t.procedure.meta({ mcp: true }).query((): string => {
      throw new Error('db password is hunter2');
    }),
    watch: t.procedure.meta({ mcp: true }).subscription(async function* () {
      yield tracked('1', 'Hello');
    }),
  },
  internal: {
    reindex: t.procedure.mutation(() => 'ok'),
    hidden: t.procedure.meta({ mcp: false }).query(() => 'secret'),
  },
};
