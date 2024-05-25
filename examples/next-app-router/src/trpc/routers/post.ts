import { TRPCError, TRPCRouterRecord } from '@trpc/server';
import { db } from '~/db/client';
import { Post } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { protectedProcedure, publicProcedure } from '../init';

export const postRouter = {
  list: publicProcedure.query(() =>
    db.query.Post.findMany({ with: { user: true } }),
  ),
  create: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        content: z.string(),
      }),
    )
    .mutation(async (opts) => {
      const { input, ctx } = opts;

      await db.insert(Post).values({
        authorId: ctx.userId,
        content: input.content,
        title: input.title,
        createdAt: new Date(),
      });
    }),
  delete: protectedProcedure.input(z.number()).mutation(async (opts) => {
    const { input, ctx } = opts;

    const post = await db.query.Post.findFirst({
      where: (fields, op) =>
        op.and(op.eq(fields.id, input), op.eq(fields.authorId, ctx.userId)),
    });
    if (!post) throw new TRPCError({ code: 'UNAUTHORIZED' });

    await db.delete(Post).where(eq(Post.id, input));
  }),
} satisfies TRPCRouterRecord;
