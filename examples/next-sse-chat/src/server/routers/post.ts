import { on } from 'events';
import { tracked } from '@trpc/server';
import { streamToAsyncIterable } from '~/lib/stream-to-async-iterator';
import { db } from '~/server/db/client';
import { Post, type PostType } from '~/server/db/schema';
import { z } from 'zod';
import { authedProcedure, publicProcedure, router } from '../trpc';
import type { MyEvents } from './channel';
import { currentlyTyping, ee } from './channel';

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

      const channelTyping = currentlyTyping[channelId];
      if (channelTyping) {
        delete channelTyping[opts.ctx.user.name];
        ee.emit('isTypingUpdate', channelId, channelTyping);
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const defPost = post!;
      ee.emit('add', channelId, defPost);

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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        nextCursor = prev!.createdAt;
      }
      return {
        items,
        nextCursor,
      };
    }),

  onAdd: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        // lastEventId is the last event id that the client has received
        // On the first call, it will be whatever was passed in the initial setup
        // If the client reconnects, it will be the last event id that the client received
        lastEventId: z.string().nullish(),
      }),
    )
    .subscription(async function* (opts) {
      let lastMessageCursor: Date | null = null;
      // We start by subscribing to the ee so that we don't miss any new events while fetching
      const iterable = ee.toIterable('add', {
        signal: opts.signal,
      });

      const eventId = opts.input.lastEventId;
      if (eventId) {
        const itemById = await db.query.Post.findFirst({
          where: (fields, ops) => ops.eq(fields.id, eventId),
        });
        lastMessageCursor = itemById?.createdAt ?? null;
      }

      const newItemsSinceCursor = await db.query.Post.findMany({
        where: (fields, ops) =>
          ops.and(
            ops.eq(fields.channelId, opts.input.channelId),
            lastMessageCursor
              ? ops.gt(fields.createdAt, lastMessageCursor)
              : undefined,
          ),
        orderBy: (fields, ops) => ops.asc(fields.createdAt),
      });

      function* maybeYield(post: PostType) {
        if (post.channelId !== opts.input.channelId) {
          // ignore posts from other channels
          return;
        }
        if (lastMessageCursor && post.createdAt <= lastMessageCursor) {
          // ignore posts that we've already sent
          return;
        }

        yield tracked(post.id, post);

        // update the cursor so that we don't send this post again
        lastMessageCursor = post.createdAt;
      }

      // yield the posts we fetched from the db
      for (const post of newItemsSinceCursor) {
        yield* maybeYield(post);
      }

      for await (const [channelId, post] of iterable) {
        if (channelId !== opts.input.channelId) continue;
        yield* maybeYield(post);
      }
    }),
});
