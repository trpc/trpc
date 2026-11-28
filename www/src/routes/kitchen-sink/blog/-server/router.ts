/**
 * The showcase's API: a blog, kept in memory. Its pages load a post, its
 * author and the posts of the author's team in one request (`../$slug.tsx`).
 * It never changes, so every request and server instance sees the same data.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import { authors, type Post, posts } from './data.ts';

export interface Context {
  /** The blog's "Slow queries" switch is on, for this request */
  readonly slowQueries: boolean;
}

const t = initTRPC.context<Context>().create();

/**
 * With the blog's "Slow queries" switch on, every query of the blog waits 1 to
 * 3 seconds, so that you can watch each one load
 */
const blogProcedure = t.procedure.use(async (opts) => {
  if (opts.ctx.slowQueries) {
    await new Promise((resolve) =>
      setTimeout(resolve, 1_000 + Math.random() * 2_000),
    );
  }
  return opts.next();
});

export const appRouter = t.router({
  blog: t.router({
    /**
     * A page of posts, newest first. Used as an infinite query by the post
     * list and by a post's "More from the team" list
     */
    posts: blogProcedure
      .input(
        z.object({
          /** Only posts by the authors of this team */
          teamId: z.string().optional(),
          limit: z.number().min(1).max(50).default(10),
          /** How many posts to skip */
          cursor: z.number().nullish(),
        }),
      )
      .query((opts) => {
        const { teamId } = opts.input;
        const teamAuthorIds =
          teamId === undefined
            ? null
            : authors.filter((it) => it.teamId === teamId).map((it) => it.id);
        const matching = posts.filter(
          (post) =>
            teamAuthorIds === null || teamAuthorIds.includes(post.authorId),
        );
        const start = opts.input.cursor ?? 0;
        const end = start + opts.input.limit;
        return {
          items: matching.slice(start, end).map((post) => ({
            authorId: post.authorId,
            publishedAt: post.publishedAt,
            slug: post.slug,
            title: post.title,
          })),
          nextCursor: end < matching.length ? end : null,
        };
      }),
    postBySlug: blogProcedure
      .input(z.object({ slug: z.string() }))
      .query((opts) => {
        const index = posts.findIndex((it) => it.slug === opts.input.slug);
        const post = posts[index];
        if (post === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        // The posts on either side of it in the list, for the links at its
        // end
        const linkTo = (it: Post | undefined) =>
          it === undefined ? null : { slug: it.slug, title: it.title };
        return {
          ...post,
          newer: linkTo(posts[index - 1]),
          older: linkTo(posts[index + 1]),
        };
      }),
    authorById: blogProcedure
      .input(z.object({ id: z.string() }))
      .query((opts) => {
        const author = authors.find((it) => it.id === opts.input.id);
        if (author === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return author;
      }),
  }),
});

export type AppRouter = typeof appRouter;
