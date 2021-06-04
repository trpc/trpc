import { Message, PrismaClient } from '@prisma/client';
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { z } from 'zod';
import superjson from 'superjson';
const prisma = new PrismaClient();

async function createMessage(text: string) {
  const msg = await prisma.message.create({
    data: {
      text,
    },
  });
  return msg;
}

async function getMessagesAfter(timestamp: Date) {
  return prisma.message.findMany({
    orderBy: {
      createdAt: 'asc',
    },
    where: {
      OR: [
        {
          createdAt: {
            gt: timestamp,
          },
        },
        {
          updatedAt: {
            gt: timestamp,
          },
        },
      ],
    },
  });
}

// ctx
const createContext = ({ req, res }: trpcNext.CreateNextContextOptions) => {
  return {};
};
export type Context = trpc.inferAsyncReturnType<typeof createContext>;

function createRouter() {
  return trpc.router<Context>();
}

export const appRouter = createRouter()
  .query('hello', {
    input: z
      .object({
        text: z.string().optional(),
      })
      .optional(),
    resolve({ input }) {
      return `hello ${input?.text ?? 'world'}`;
    },
  })
  .merge(
    'messages.',
    createRouter()
      .query('list', {
        input: z.object({
          cursor: z.date().optional(),
          take: z.number().min(1).max(50).optional(),
        }),
        async resolve({ input: { take = 10, cursor } }) {
          // `cursor` is of type `Date | undefined`
          // `take` is of type `number | undefined`
          const page = await prisma.message.findMany({
            orderBy: {
              createdAt: 'desc',
            },
            cursor: cursor
              ? {
                  createdAt: cursor,
                }
              : undefined,
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
        },
      })
      .mutation('create', {
        input: z.object({
          text: z.string().min(2),
        }),
        resolve: async ({ input }) => {
          const msg = await createMessage(input.text);
          return msg;
        },
      })
      .subscription('newMessages', {
        input: z.object({
          timestamp: z.date(),
        }),
        resolve: ({ input }) => {
          const { timestamp } = input;
          return trpc.subscriptionPullFactory<Message>({
            intervalMs: 500,
            async pull(emit) {
              const msgs = await getMessagesAfter(timestamp);
              for (const msg of msgs) {
                emit.data(msg);
              }
            },
          });
        },
      }),
  );

export type AppRouter = typeof appRouter;

export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
  teardown: () => prisma.$disconnect(),
  transformer: superjson,
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
    }
  },
});
