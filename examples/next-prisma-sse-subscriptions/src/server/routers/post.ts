/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */
import type { Post, Prisma } from '@prisma/client';
import { type SSEvent } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authedProcedure, publicProcedure, router } from '../trpc';
import EventEmitter, { on } from 'events';
import { streamToAsyncIterable } from '~/utils/streamToAsyncIterable';
import type { WhoIsTyping } from '../db-listener';
import { currentlyTyping, dbEvents } from '../db-listener';

async function updateIsTyping(name: string, isTyping: boolean) {
  if (isTyping) {
    await prisma.isTyping.upsert({
      where: {
        name,
      },
      update: {
        updatedAt: new Date(),
      },
      create: {
        name,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.isTyping.deleteMany({
      where: {
        name,
      },
    });
  }
}

export const postRouter = router({
  add: authedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        text: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { name } = ctx.user;
      const post = await prisma.post.create({
        data: {
          ...input,
          name,
          source: 'GITHUB',
        },
      });
      await updateIsTyping(name, false);
      return post;
    }),

  isTyping: authedProcedure
    .input(z.object({ typing: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await updateIsTyping(ctx.user.name, input.typing);
    }),

  infinite: publicProcedure
    .input(
      z.object({
        cursor: z.date().nullish(),
        take: z.number().min(1).max(50).nullish(),
      }),
    )
    .query(async ({ input }) => {
      const take = input.take ?? 10;
      const cursor = input.cursor;

      const page = await prisma.post.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        cursor: cursor ? { createdAt: cursor } : undefined,
        take: take + 1,
        skip: 0,
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
        lastEventId: z.string().nullish(),
      }),
    )
    .subscription(async function* (opts) {
      async function getPostsSince(date: Date | null) {
        const where: Prisma.PostWhereInput = date
          ? {
              createdAt: {
                gt: date,
              },
            }
          : {};

        return await prisma.post.findMany({
          where,
          orderBy: {
            createdAt: 'asc',
          },
        });
      }

      let lastMessageCursor: Date | null = null;

      if (opts.input.lastEventId) {
        const itemById = await prisma.post.findUnique({
          where: {
            id: opts.input.lastEventId,
          },
        });
        lastMessageCursor = itemById?.createdAt ?? null;
      }

      let unsubscribe = () => {
        //
      };
      const stream = new ReadableStream<Post>({
        async start(controller) {
          const onAdd = (data: Post) => {
            controller.enqueue(data);
          };
          dbEvents.on('add', onAdd);

          const items = await getPostsSince(lastMessageCursor);
          for (const item of items) {
            controller.enqueue(item);
          }
          unsubscribe = () => {
            dbEvents.off('add', onAdd);
          };
        },
        cancel() {
          unsubscribe();
        },
      });

      for await (const post of streamToAsyncIterable(stream)) {
        yield {
          id: post.id,
          data: post,
        } satisfies SSEvent;
      }
    }),

  whoIsTyping: publicProcedure
    .input(
      z
        .object({
          lastEventId: z.string().optional(),
        })
        .optional(),
    )
    .subscription(async function* (opts) {
      let lastEventId = opts?.input?.lastEventId ?? '';

      const maybeYield = function* (who: WhoIsTyping) {
        const id = Object.keys(who).sort().toString();
        if (lastEventId === id) {
          return;
        }
        yield {
          id,
          data: Object.keys(who),
        } satisfies SSEvent;

        lastEventId = id;
      };

      // if someone is typing, emit event immediately
      yield* maybeYield(currentlyTyping);

      for await (const [who] of dbEvents.toIterable('isTypingUpdate')) {
        yield* maybeYield(who);
      }
    }),
});
