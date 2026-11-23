import { tracked } from '@trpc/server';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { Post } from '~/server/db/schema';
import { publish } from '~/server/pubsub';
import { authedProcedure, publicProcedure, router } from '../trpc';
import { ee, ensureListening } from './channel';

export const postRouter = router({
  add: authedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        channelId: z.string().uuid(),
        text: z.string().trim().min(1),
      }),
    )
    .mutation(async (opts) => {
      const { channelId } = opts.input;

      const [post] = await db
        .insert(Post)
        .values({
          id: opts.input.id,
          text: opts.input.text,
          name: opts.ctx.user.name,
          channelId,
        })
        .returning();

      // oxlint-disable-next-line typescript/no-non-null-assertion
      const defPost = post!;
      await publish({
        type: 'add',
        channelId,
        postId: defPost.id,
        name: opts.ctx.user.name,
      });

      return post;
    }),

  infinite: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        cursor: z.date().nullish(),
        take: z.number().min(1).max(50).nullish(),
      }),
    )
    .query(async (opts) => {
      const take = opts.input.take ?? 20;
      const cursor = opts.input.cursor;

      const page = await db.query.Post.findMany({
        orderBy: (fields, ops) => ops.desc(fields.createdAt),
        where: (fields, ops) =>
          ops.and(
            ops.eq(fields.channelId, opts.input.channelId),
            cursor ? ops.lte(fields.createdAt, cursor) : undefined,
          ),
        limit: take + 1,
      });

      const items = page.reverse();
      let nextCursor: typeof cursor | null = null;
      if (items.length > take) {
        const prev = items.shift();
        // oxlint-disable-next-line typescript/no-non-null-assertion
        nextCursor = prev!.createdAt;
      }
      return {
        items,
        nextCursor,
      };
    }),

  /**
   * New posts in every channel, so that switching channels doesn't need a new
   * subscription. The client sorts them into channels.
   */
  onAdd: publicProcedure
    .input(
      z.object({
        // The id of the last post the client received.
        // `httpSubscriptionLink` sets it when it reconnects.
        lastEventId: z.string().nullish(),
      }),
    )
    // Not a generator: tRPC sends the client its `connected` event once this
    // resolves, so the client can count on the server listening by then
    .subscription(async (opts) => {
      // Listen before querying the database, so no post is missed in between
      const newPosts = ee.toIterable('add', { signal: opts.signal });
      await ensureListening();

      // After a reconnect, send the posts added while the client was away
      const missedPosts = await (async () => {
        const lastEventId = opts.input.lastEventId;
        if (!lastEventId) return [];

        const lastPost = await db.query.Post.findFirst({
          where: (fields, ops) => ops.eq(fields.id, lastEventId),
        });
        if (!lastPost) return [];

        // Posts in other channels can share the last post's timestamp, so include it
        return db.query.Post.findMany({
          where: (fields, ops) =>
            ops.and(
              ops.gte(fields.createdAt, lastPost.createdAt),
              ops.ne(fields.id, lastPost.id),
            ),
          orderBy: (fields, ops) => ops.asc(fields.createdAt),
        });
      })();

      return (async function* () {
        for (const post of missedPosts) {
          yield tracked(post.id, post);
        }

        // A post added while we queried is in both, so skip the ones we've sent
        const sentIds = new Set(missedPosts.map((post) => post.id));
        for await (const [post] of newPosts) {
          if (!sentIds.has(post.id)) {
            yield tracked(post.id, post);
          }
        }
      })();
    }),
});
