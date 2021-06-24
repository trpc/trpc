/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */

import { z } from 'zod';
import { createRouter } from 'pages/api/trpc/[trpc]';
import { PostOrderByInput, Prisma } from '@prisma/client';
// import { PostOrderByInput } from '@prisma/client';
export const postsRouter = createRouter()
  // create
  .mutation('add', {
    input: z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(32),
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const todo = await ctx.prisma.post.create({
        data: input,
      });
      return todo;
    },
  })
  // read
  .query('all', {
    input: z
      .object({
        orderBy: z
          .unknown()
          .refine((obj) => {
            const shape = z.record(z.literal('asc').or(z.literal('desc')));

            const sortBy = shape.or(z.array(shape));

            return sortBy.safeParse(obj).success;
          })
          .transform((s) => s as Prisma.PostFindManyArgs['orderBy']),
      })
      .optional(),
    async resolve({ ctx, input }) {
      /**
       * For pagination you can have a look at this docs site
       * @link https://trpc.io/docs/useInfiniteQuery
       */

      return ctx.prisma.post.findMany(input);
    },
  })
  .query('byId', {
    input: z.string(),
    async resolve({ ctx, input }) {
      return ctx.prisma.post.findUnique({
        where: { id: input },
      });
    },
  })
  // update
  .mutation('edit', {
    input: z.object({
      id: z.string().uuid(),
      data: z.object({
        title: z.string().min(1).max(32).optional(),
        text: z.string().min(1).optional(),
      }),
    }),
    async resolve({ ctx, input }) {
      const { id, data } = input;
      const todo = await ctx.prisma.post.update({
        where: { id },
        data,
      });
      return todo;
    },
  })
  // delete
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.prisma.post.delete({ where: { id } });
      return id;
    },
  });
