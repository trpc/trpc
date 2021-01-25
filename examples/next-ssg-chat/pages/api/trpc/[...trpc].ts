import { Message, PrismaClient } from '@prisma/client';
import * as trpc from '@trpcdev/server';
import * as z from 'zod';
import { sj } from '../../../utils/serializer';
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
      .subscription('newMessages', {
        input: z.object({
          timestamp: z.date(),
        }),
        resolve: ({ input }) => {
          const { timestamp } = input;
          return trpc.subscriptionPullFatory<Message[]>({
            interval: 500,
            async pull(emit) {
              const msgs = await getMessagesAfter(timestamp);
              if (msgs.length > 0) {
                emit.data(msgs);
              }
            },
          });
        },
      }),
  );

export const chatRouter = router;
export type ChatRouter = typeof router;

export default trpc.createNextApiHandler({
  router,
  createContext,
  teardown: () => prisma.$disconnect(),
  transformer: sj,
});
