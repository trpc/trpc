import type { Post, Prisma } from '@prisma/client';
import { type SSEvent } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authedProcedure, publicProcedure, router } from '../trpc';
import EventEmitter, { on } from 'events';
import { streamToAsyncIterable } from '~/utils/streamToAsyncIterable';

type WhoIsTyping = Record<string, { lastTyped: Date }>;
interface MyEvents {
  add: (data: Post) => void;
  isTypingUpdate: (who: WhoIsTyping) => void;
}
declare interface MyEventEmitter {
  on<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  off<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  once<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  emit<TEv extends keyof MyEvents>(
    event: TEv,
    ...args: Parameters<MyEvents[TEv]>
  ): boolean;
}

class MyEventEmitter extends EventEmitter {
  public toIterable<TEv extends keyof MyEvents>(
    event: TEv,
  ): AsyncIterable<Parameters<MyEvents[TEv]>> {
    return on(this, event);
  }
}

// In a real app, you'd probably use Redis or something
const ee = new MyEventEmitter();

// who is currently typing, key is `name`
const currentlyTyping: WhoIsTyping = Object.create(null);

// every 1s, clear old "isTyping"
setInterval(() => {
  let updated = false;
  const now = Date.now();
  for (const [key, value] of Object.entries(currentlyTyping)) {
    if (now - value.lastTyped.getTime() > 3e3) {
      delete currentlyTyping[key];
      updated = true;
    }
  }
  if (updated) {
    ee.emit('isTypingUpdate', currentlyTyping);
  }
}, 3e3).unref();

export const postRouter = router({
  add: authedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        text: z.string().trim().min(1),
      }),
    )
    .mutation(async (opts) => {
      const post = await prisma.post.create({
        data: {
          ...opts.input,
          name: opts.ctx.user.name,
          source: 'GITHUB',
        },
      });
      delete currentlyTyping[opts.ctx.user.name];
      ee.emit('isTypingUpdate', currentlyTyping);
      ee.emit('add', post);

      return post;
    }),

  isTyping: authedProcedure
    .input(z.object({ typing: z.boolean() }))
    .mutation(async (opts) => {
      const { name } = opts.ctx.user;
      if (!opts.input.typing) {
        delete currentlyTyping[name];
      } else {
        currentlyTyping[name] = {
          lastTyped: new Date(),
        };
      }
      ee.emit('isTypingUpdate', currentlyTyping);
    }),

  infinite: publicProcedure
    .input(
      z.object({
        cursor: z.date().nullish(),
        take: z.number().min(1).max(50).nullish(),
      }),
    )
    .query(async (opts) => {
      const take = opts.input.take ?? 10;
      const cursor = opts.input.cursor;

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
          ee.on('add', onAdd);

          const items = await getPostsSince(lastMessageCursor);
          for (const item of items) {
            controller.enqueue(item);
          }
          unsubscribe = () => {
            ee.off('add', onAdd);
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

      for await (const [who] of ee.toIterable('isTypingUpdate')) {
        yield* maybeYield(who);
      }
    }),
});
