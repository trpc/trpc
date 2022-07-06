/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */
import { t } from '../trpc';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '~/server/prisma';

/**
 * Default selector for Post.
 * It's important to always explicitly say which fields you want to return in order to not leak extra information
 * @see https://github.com/prisma/prisma/issues/9353
 */
const defaultPostSelect = Prisma.validator<Prisma.PostSelect>()({
  id: true,
  title: true,
  text: true,
  createdAt: true,
  updatedAt: true,
});

export const postRouter = t.router({
  list: t.procedure.query(() => {
    /**
     * For pagination you can have a look at this docs site
     * @link https://trpc.io/docs/useInfiniteQuery
     */

    return prisma.post.findMany({
      select: defaultPostSelect,
    });
  }),
  byId: t.procedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { id } = input;
      const post = await prisma.post.findUnique({
        where: { id },
        select: defaultPostSelect,
      });
      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No post with id '${id}'`,
        });
      }
      return post;
    }),
  add: t.procedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).max(32),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const post = await prisma.post.create({
        data: input,
        select: defaultPostSelect,
      });
      return post;
    }),
});
