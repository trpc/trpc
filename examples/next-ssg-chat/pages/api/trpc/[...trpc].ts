import { Message, PrismaClient } from '@prisma/client';
import * as trpc from '@trpc/server';
import * as z from 'zod';
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
const createContext = ({ req, res }: trpc.CreateNextContextOptions) => {
  return {};
};
export type Context = trpc.inferAsyncReturnType<typeof createContext>;

function createRouter() {
  return trpc.router<Context>();
}
const router = createRouter()
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
        input: z.any(),
        resolve: async () => {
          const items = await prisma.message.findMany({
            orderBy: {
              createdAt: 'asc',
            },
          });
          return {
            items,
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
      .mutation('edit', {
        input: z.object({
          id: z.string(),
          text: z.string().min(2),
        }),
        async resolve({ input }) {
          const { id, ...update } = input;
          const newData = await prisma.message.update({
            where: {
              id: input.id,
            },
            data: {
              ...update,
              updatedAt: new Date(),
            },
          });
          return newData;
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

export const appRouter = router;
export type AppRouter = typeof router;

export default trpc.createNextApiHandler({
  router,
  createContext,
  teardown: () => prisma.$disconnect(),
  transformer: superjson,
});
