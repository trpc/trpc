import { byIdInput, connectionArgs, createResolver } from '@nkzw/fate/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '~/server/prisma';
import { feedDataView } from '~/server/views';
import { publicProcedure, router } from '../trpc';

const feedQueryInput = z.object({
  args: connectionArgs,
  select: z.array(z.string()),
});

async function resolveFeed(input: {
  args?: Record<string, unknown>;
  select: string[];
}) {
  const { resolve, select } = createResolver({
    args: input.args,
    select: input.select,
    view: feedDataView,
  });

  const postsSelect =
    'posts' in select &&
    typeof select.posts === 'object' &&
    select.posts !== null &&
    'select' in select.posts
      ? (select.posts as Prisma.PostFindManyArgs)
      : undefined;

  const posts = postsSelect
    ? await prisma.post.findMany({
        ...postsSelect,
        orderBy: {
          createdAt: 'desc',
        },
      })
    : [];

  return await resolve({
    id: 'feed',
    posts,
  });
}

export const feedRouter = router({
  byId: publicProcedure.input(byIdInput).query(async ({ input }) => {
    const feed = await resolveFeed(input);

    return input.ids.includes('feed') ? [feed] : [];
  }),
  get: publicProcedure.input(feedQueryInput).query(async ({ input }) => {
    return await resolveFeed(input);
  }),
});
