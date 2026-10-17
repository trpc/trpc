import { Effect, Schema } from 'effect';
import { error, initTrpc, tracked, TrpcError } from '@trpc12/trpc/server';
import { z } from 'zod';
import { openapi } from '@trpc12/trpc/openapi';

export interface Post {
  id: string;
  title: string;
  /** When it was published. */
  publishedAt: Date | null;
  tags: string[];
  status: 'draft' | 'published';
  meta?: { views: number };
}

export interface Comment {
  text: string;
  replies: Comment[];
}

type PostId = string & { readonly __brand: 'PostId' };

class PostMissing extends TrpcError.Tagged('POST_NOT_FOUND', {
  status: 404,
  data: Schema.Struct({ id: Schema.String }),
}) {}

const t = initTrpc<{ ctx: { user: string | null } }>().concat(openapi());
const posts = new Map<string, Post>();

export const appRouter = {
  post: {
    byId: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .query((opts) =>
        Effect.gen(function* () {
          const post = posts.get(opts.input.id);
          if (!post) return yield* new PostMissing({ id: opts.input.id });
          return post;
        }),
      ),
    list: t.procedure
      .meta({ route: { method: 'GET', path: '/posts' } })
      .query((): Post[] => [...posts.values()]),
    create: t.procedure
      .meta({ route: { method: 'POST', path: '/posts' } })
      .input((opts: { ctx: { user: string | null } }) =>
        opts.ctx.user ? z.object({ title: z.string() }) : z.never(),
      )
      .mutation((opts) => {
        if (!opts.ctx.user) return error({ code: 'UNAUTHORIZED' });
        const post: Post = {
          id: String(posts.size + 1),
          title: opts.input.title,
          publishedAt: null,
          tags: [],
          status: 'draft',
        };
        posts.set(post.id, post);
        return post;
      }),
    comments: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}/comments' } })
      .input((opts: { ctx: { user: string | null } }) =>
        opts.ctx.user ? z.object({ id: z.string() }) : z.never(),
      )
      .query(
        (): {
          postId: PostId;
          comments: Comment[];
          total: bigint | number;
        } => ({
          postId: '1' as PostId,
          comments: [],
          total: 0,
        }),
      ),
    onCreated: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/events' } })
      .subscription(async function* () {
        for (const post of posts.values()) yield tracked(post.id, post);
      }),
    count: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/count' } })
      .output(Schema.Number)
      .query(() =>
        Effect.gen(function* () {
          if (posts.size > 1000) {
            return yield* Effect.fail(
              new TrpcError({
                code: 'CONFLICT',
                data: { reason: 'too many' as const },
              }),
            );
          }
          return posts.size;
        }),
      ),
  },
};

export type AppRouter = typeof appRouter;
