import { randomUUID } from 'crypto';
import { TRPCError, TRPCRouterRecord } from '@trpc/server';
import { db } from '~/db/client';
import { posts, users } from '~/db/schema';
import { and, eq } from 'drizzle-orm';
import * as z from 'zod';
import { protectedProcedure, publicProcedure } from '../init';

export const postRouter = {
  list: publicProcedure.query(() =>
    db.select().from(posts).leftJoin(users, eq(posts.authorId, users.id)),
  ),
  create: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        content: z.string(),
      }),
    )
    .mutation((opts) => {
      const { input, ctx } = opts;

      return db.insert(posts).values({
        id: randomUUID(),
        authorId: ctx.userId,
        content: input.content,
        title: input.title,
        createdAt: new Date(),
      });
    }),
  delete: protectedProcedure.input(z.string()).mutation(async (opts) => {
    const { input, ctx } = opts;

    const post = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, input), eq(posts.authorId, ctx.userId)));
    if (!post.length) throw new TRPCError({ code: 'UNAUTHORIZED' });

    return db.delete(posts).where(eq(posts.id, input));
  }),
} satisfies TRPCRouterRecord;
