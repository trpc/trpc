import { experimental_mcp } from '@trpc12/trpc/mcp';
import { error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Context {
  user: string | null;
}

const Post = z.object({ id: z.string(), title: z.string(), at: z.date() });

const posts = new Map<string, z.infer<typeof Post>>([
  ['1', { id: '1', title: 'Hello MCP', at: new Date(0) }],
]);

const t = initTrpc<{ ctx: Context }>().concat(experimental_mcp());

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Sign in first' }),
);

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .meta({ mcp: { description: 'Read one blog post by its id.' } })
      .input(z.object({ id: z.string().describe('The post id, e.g. "1"') }))
      .output(Post)
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .query(
        (opts) =>
          posts.get(opts.input.id) ??
          opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
      ),
    create: authed
      .meta({ mcp: { description: 'Publish a post as the signed-in user.' } })
      .input(z.object({ title: z.string().min(3) }))
      .output(Post)
      .mutation((opts) => {
        const post: z.infer<typeof Post> = {
          id: String(posts.size + 1),
          title: `${opts.input.title}, by ${opts.ctx.user}`,
          at: new Date(),
        };
        posts.set(post.id, post);
        return post;
      }),
    // Over RPC only: no `mcp` meta.
    list: t.procedure.query(() => [...posts.values()]),
  },
});

export type AppRouter = typeof appRouter;
