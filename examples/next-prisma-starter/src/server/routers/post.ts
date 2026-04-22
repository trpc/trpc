import { byIdInput, createResolver, withConnection } from '@nkzw/fate/server';
import type { Post as PrismaPost } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '~/server/prisma';
import { postDataView } from '~/server/views';
import { publicProcedure, router } from '../trpc';

const publicConnection = withConnection(publicProcedure);

export const postRouter = router({
  list: publicConnection({
    defaultSize: 5,
    async map({ input, items }) {
      const { resolveMany } = createResolver({
        args: input.args,
        select: input.select,
        view: postDataView,
      });

      return await resolveMany(items as Array<Record<string, unknown>>);
    },
    async query({ cursor, input, skip, take }) {
      const { select } = createResolver({
        args: input.args,
        select: input.select,
        view: postDataView,
      });

      return await prisma.post.findMany({
        cursor: cursor
          ? {
              id: cursor,
            }
          : undefined,
        orderBy: {
          createdAt: 'desc',
        },
        select,
        skip,
        take,
      });
    },
  }),
  byId: publicProcedure
    .input(byIdInput)
    .query(async ({ input }) => {
      const { resolveMany, select } = createResolver({
        args: input.args,
        select: input.select,
        view: postDataView,
      });

      const posts = await prisma.post.findMany({
        select,
        where: {
          id: {
            in: input.ids,
          },
        },
      });

      if (input.ids.length === 1 && posts.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No post with id '${input.ids[0]}'`,
        });
      }

      const postsById = new Map<string, (typeof posts)[number]>(
        posts.map((post) => [post.id, post]),
      );

      return await resolveMany(
        input.ids
          .map((id) => postsById.get(id))
          .filter((post): post is (typeof posts)[number] => Boolean(post)),
      );
    }),
  add: publicProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        select: z.array(z.string()),
        title: z.string().min(1).max(32),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, select, text, title } = input;
      const { resolve, select: prismaSelect } = createResolver({
        select,
        view: postDataView,
      });

      const post = await prisma.post.create({
        data: {
          id,
          text,
          title,
        },
        select: prismaSelect,
      });

      return await resolve(post as unknown as PrismaPost);
    }),
});
