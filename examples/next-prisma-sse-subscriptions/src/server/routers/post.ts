/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */
import type { Prisma } from '@prisma/client';
import { TRPCError, type SSEvent } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authedProcedure, publicProcedure, router } from '../trpc';

const POLL_INTERVAL_MS = 500;
const waitMs = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (timer.unref) {
      timer.unref();
    }
  });

async function updateIsTyping(name: string, isTyping: boolean) {
  await prisma.isTyping.upsert({
    where: {
      name,
    },
    create: {
      name,
      isTyping,
    },
    update: {
      isTyping,
    },
  });
}
export const postRouter = router({
  add: authedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        text: z.string().min(1),
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
      let lastMessageCursor: Date | null = null;

      async function* streamMessagesSince(date: Date | null) {
        const where: Prisma.PostWhereInput = date
          ? {
              createdAt: {
                gt: date,
              },
            }
          : {};

        // if there's more than 100 items, we abort
        const numItems = await prisma.post.count({
          where,
        });
        if (numItems > 100) {
          throw new TRPCError({
            code: 'UNPROCESSABLE_CONTENT',
            message: 'Too many items',
          });
        }
        const items = await prisma.post.findMany({
          where,
          orderBy: {
            createdAt: 'asc',
          },
        });
        lastMessageCursor = items.at(-1)?.createdAt ?? lastMessageCursor;
        for (const item of items) {
          try {
            yield {
              id: item.id,
              data: item,
            } satisfies SSEvent;
          } catch (err) {
            console.error('yield error', err);
          }
        }
      }
      if (opts.input.lastEventId) {
        const itemById = await prisma.post.findUnique({
          where: {
            id: opts.input.lastEventId,
          },
        });
        lastMessageCursor = itemById?.createdAt ?? null;
      }
      // poll for new messages every 500ms
      while (true) {
        if (opts.ctx.req.signal.aborted) {
          return;
        }
        yield* streamMessagesSince(lastMessageCursor);
        await waitMs(POLL_INTERVAL_MS);
      }
    }),

  whoIsTyping: publicProcedure.subscription(async function* (opts) {
    let prev: string[] | null = null;
    while (true) {
      if (opts.ctx.req.signal.aborted) {
        return;
      }

      const whoIsTyping = await prisma.isTyping.findMany({
        where: {
          isTyping: true,
        },
      });
      const mapped = whoIsTyping
        .filter((it) => {
          // only get the ones latest 3s
          const diffMs = Date.now() - it.updatedAt.getTime();
          return diffMs < 3000;
        })
        .map((it) => it.name)
        .sort();
      if (prev?.toString() !== mapped.toString()) {
        yield {
          data: mapped,
        } satisfies SSEvent;
      }

      prev = mapped;
      await waitMs(POLL_INTERVAL_MS);
    }
  }),
});
