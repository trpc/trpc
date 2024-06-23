import { sse } from '@trpc/server';
import { streamToAsyncIterable } from '~/lib/stream-to-async-iterator';
import { db } from '~/server/db/client';
import { Post, type PostType } from '~/server/db/schema';
import { z } from 'zod';
import { authedProcedure, publicProcedure, router } from '../trpc';
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
          author: opts.ctx.user.name,
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

      const eventId = opts.input.lastEventId;
      if (eventId) {
        const itemById = await db.query.Post.findFirst({
          where: (fields, ops) => ops.eq(fields.id, eventId),
        });
        lastMessageCursor = itemById?.createdAt ?? null;
      }

      let unsubscribe = () => {
        //
      };

      // We use a readable stream here to prevent the client from missing events
      const stream = new ReadableStream<PostType>({
        async start(controller) {
          const onAdd = (channelId: string, data: PostType) => {
            if (channelId === opts.input.channelId) {
              controller.enqueue(data);
            }
          };
          ee.on('add', onAdd);
          unsubscribe = () => {
            ee.off('add', onAdd);
          };

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

          for (const item of newItemsSinceCursor) {
            controller.enqueue(item);
          }
        },
        cancel() {
          unsubscribe();
        },
      });

      for await (const post of streamToAsyncIterable(stream)) {
        yield sse({
          // yielding the post id ensures the client can reconnect at any time and get the latest events this id
          id: post.id,
          data: post,
        });
      }
    }),
});
