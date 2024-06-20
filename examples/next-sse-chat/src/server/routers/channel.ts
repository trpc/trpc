import EventEmitter, { on } from 'node:events';
import type { TRPCRouterRecord } from '@trpc/server';
import { sse } from '@trpc/server';
import { db } from '~/server/db/client';
import type { PostType } from '~/server/db/schema';
import { Channel } from '~/server/db/schema';
import { authedProcedure, publicProcedure } from '~/server/trpc';
import { z } from 'zod';

export type WhoIsTyping = Record<string, { lastTyped: Date }>;

interface MyEvents {
  add: (channelId: string, data: PostType) => void;
  isTypingUpdate: (channelId: string, who: WhoIsTyping) => void;
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
export const ee = new MyEventEmitter();

// who is currently typing for each channel, key is `name`
export const currentlyTyping: Record<string, WhoIsTyping> = Object.create(null);

// every 1s, clear old "isTyping"
setInterval(() => {
  const updatedChannels = new Set<string>();
  const now = Date.now();
  for (const [channelId, typers] of Object.entries(currentlyTyping)) {
    for (const [key, value] of Object.entries(typers ?? {})) {
      if (now - value.lastTyped.getTime() > 3e3) {
        delete typers[key];
        updatedChannels.add(channelId);
      }
    }
  }
  updatedChannels.forEach((channelId) => {
    ee.emit('isTypingUpdate', channelId, currentlyTyping[channelId] ?? {});
  });
}, 3e3).unref();

export const channelRouter = {
  list: publicProcedure.query(() => {
    return db.query.Channel.findMany();
  }),

  create: authedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [channel] = await db
        .insert(Channel)
        .values({
          name: input.name,
        })
        .returning();

      return channel.id;
    }),

  isTyping: authedProcedure
    .input(z.object({ channelId: z.string().uuid(), typing: z.boolean() }))
    .mutation(async (opts) => {
      const { name } = opts.ctx.user;
      const { channelId } = opts.input;

      if (!currentlyTyping[channelId]) {
        currentlyTyping[channelId] = {};
      }

      if (!opts.input.typing) {
        delete currentlyTyping[channelId][name];
      } else {
        currentlyTyping[channelId][name] = {
          lastTyped: new Date(),
        };
      }
      ee.emit('isTypingUpdate', channelId, currentlyTyping[channelId]);
    }),

  whoIsTyping: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        lastEventId: z.string().optional(),
      }),
    )
    .subscription(async function* (opts) {
      const { channelId } = opts.input;
      let lastEventId = opts?.input?.lastEventId ?? '';

      if (!currentlyTyping[channelId]) {
        currentlyTyping[channelId] = {};
      }

      const maybeYield = function* (who: WhoIsTyping) {
        const id = Object.keys(who).sort().toString();
        if (lastEventId === id) {
          return;
        }
        yield sse({
          id,
          data: Object.keys(who).filter(
            (user) => user !== opts.ctx.session?.user?.name,
          ),
        });

        lastEventId = id;
      };

      // if someone is typing, emit event immediately
      yield* maybeYield(currentlyTyping[channelId]);

      for await (const [channelId, who] of ee.toIterable('isTypingUpdate')) {
        if (channelId === opts.input.channelId) {
          yield* maybeYield(who);
        }
      }
    }),
} satisfies TRPCRouterRecord;
