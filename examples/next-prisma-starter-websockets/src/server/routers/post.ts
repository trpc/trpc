/**
 *
 * This is an example router, you can delete this file and then update `../pages/api/trpc/[trpc].tsx`
 */
import { Context } from '../context';
import { t } from '../trpc';
import { Post } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { z } from 'zod';

interface MyEvents {
  add: (data: Post) => void;
  isTypingUpdate: () => void;
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class MyEventEmitter extends EventEmitter {}

const ee = new MyEventEmitter();

// who is currently typing, key is `name`
const currentlyTyping: Record<string, { lastTyped: Date }> =
  Object.create(null);

// every 1s, clear old "isTyping"
const interval = setInterval(() => {
  let updated = false;
  const now = Date.now();
  for (const [key, value] of Object.entries(currentlyTyping)) {
    if (now - value.lastTyped.getTime() > 3e3) {
      delete currentlyTyping[key];
      updated = true;
    }
  }
  if (updated) {
    ee.emit('isTypingUpdate');
  }
}, 3e3);
process.on('SIGTERM', () => clearInterval(interval));

const getNameOrThrow = (ctx: Context) => {
  const name = ctx.session?.user?.name;
  if (!name) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return name;
};

export const postRouter = t.router({
  add: t.procedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        text: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const name = getNameOrThrow(ctx);
      const post = await ctx.prisma.post.create({
        data: {
          ...input,
          name,
          source: 'GITHUB',
        },
      });
      ee.emit('add', post);
      delete currentlyTyping[name];
      ee.emit('isTypingUpdate');
      return post;
    }),

  isTyping: t.procedure
    .input(z.object({ typing: z.boolean() }))
    .mutation(({ input, ctx }) => {
      const name = getNameOrThrow(ctx);
      if (!input.typing) {
        delete currentlyTyping[name];
      } else {
        currentlyTyping[name] = {
          lastTyped: new Date(),
        };
      }
      ee.emit('isTypingUpdate');
    }),

  infinite: t.procedure
    .input(
      z.object({
        cursor: z.date().nullish(),
        take: z.number().min(1).max(50).nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const take = input.take ?? 10;
      const cursor = input.cursor;

      const page = await ctx.prisma.post.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        cursor: cursor ? { createdAt: cursor } : undefined,
        take: take + 1,
        skip: 0,
      });
      const items = page.reverse();
      let prevCursor: null | typeof cursor = null;
      if (items.length > take) {
        const prev = items.shift();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        prevCursor = prev!.createdAt;
      }
      return {
        items,
        prevCursor,
      };
    }),

  onAdd: t.procedure.subscription(() => {
    return observable<Post>((emit) => {
      const onAdd = (data: Post) => emit.next(data);
      ee.on('add', onAdd);
      return () => {
        ee.off('add', onAdd);
      };
    });
  }),

  whoIsTyping: t.procedure.subscription(() => {
    let prev: string[] | null = null;
    return observable<string[]>((emit) => {
      const onIsTypingUpdate = () => {
        const newData = Object.keys(currentlyTyping);

        if (!prev || prev.toString() !== newData.toString()) {
          emit.next(newData);
        }
        prev = newData;
      };
      ee.on('isTypingUpdate', onIsTypingUpdate);
      return () => {
        ee.off('isTypingUpdate', onIsTypingUpdate);
      };
    });
  }),
});

// export const postRouter = createRouter()
//   // create
//   .mutation('add', {
//     input: z.object({
//       id: z.string().uuid().optional(),
//       text: z.string().min(1),
//     }),
//     async resolve({ ctx, input }) {
//       const name = getNameOrThrow(ctx);
//       const post = await ctx.prisma.post.create({
//         data: {
//           ...input,
//           name,
//           source: 'GITHUB',
//         },
//       });
//       ee.emit('add', post);
//       delete currentlyTyping[name];
//       ee.emit('isTypingUpdate');
//       return post;
//     },
//   })
//   .mutation('isTyping', {
//     input: z.object({
//       typing: z.boolean(),
//     }),
//     resolve({ input, ctx }) {
//       const name = getNameOrThrow(ctx);
//       if (!input.typing) {
//         delete currentlyTyping[name];
//       } else {
//         currentlyTyping[name] = {
//           lastTyped: new Date(),
//         };
//       }
//       ee.emit('isTypingUpdate');
//     },
//   })
//   .query('infinite', {
//     input: z.object({
//       cursor: z.date().nullish(),
//       take: z.number().min(1).max(50).nullish(),
//     }),
//     async resolve({ input, ctx }) {
//       const take = input.take ?? 10;
//       const cursor = input.cursor;
//       // `cursor` is of type `Date | undefined`
//       // `take` is of type `number | undefined`
//       const page = await ctx.prisma.post.findMany({
//         orderBy: {
//           createdAt: 'desc',
//         },
//         cursor: cursor
//           ? {
//               createdAt: cursor,
//             }
//           : undefined,
//         take: take + 1,
//         skip: 0,
//       });
//       const items = page.reverse();
//       let prevCursor: null | typeof cursor = null;
//       if (items.length > take) {
//         const prev = items.shift();
//         // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
//         prevCursor = prev!.createdAt;
//       }
//       return {
//         items,
//         prevCursor,
//       };
//     },
//   })
//   .subscription('onAdd', {
//     resolve() {
//       return observable<Post>((emit) => {
//         const onAdd = (data: Post) => emit.next(data);
//         ee.on('add', onAdd);
//         return () => {
//           ee.off('add', onAdd);
//         };
//       });
//     },
//   })
//   .subscription('whoIsTyping', {
//     resolve() {
//       let prev: string[] | null = null;
//       return observable<string[]>((emit) => {
//         const onIsTypingUpdate = () => {
//           const newData = Object.keys(currentlyTyping);

//           if (!prev || prev.toString() !== newData.toString()) {
//             emit.next(newData);
//           }
//           prev = newData;
//         };
//         ee.on('isTypingUpdate', onIsTypingUpdate);
//         return () => {
//           ee.off('isTypingUpdate', onIsTypingUpdate);
//         };
//       });
//     },
//   })
//   .interop();
