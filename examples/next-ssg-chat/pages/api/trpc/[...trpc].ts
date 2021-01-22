import * as trpc from '@katt/trpc-server';
import { Subscription, SubscriptionEmit } from '@katt/trpc-server';
import { Message, PrismaClient } from '@prisma/client';
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
type Context = trpc.inferAsyncReturnType<typeof createContext>;

function createRouter() {
  return trpc.router<Context>();
}
export function subscriptionPullFatory<TData>(opts: {
  interval: number;
  pull(emit: SubscriptionEmit<TData>): void | Promise<void>;
}) {
  let timer: NodeJS.Timeout;
  let stopped = false;
  async function _pull(emit: SubscriptionEmit<TData>) {
    if (stopped) {
      return;
    }
    try {
      await opts.pull(emit);
    } catch (err) {
      emit.error(err);
    }
    if (!stopped) {
      timer = setTimeout(() => _pull(emit), opts.interval);
    }
  }

  return new Subscription<TData>({
    async getInitialData(emit) {
      await _pull(emit);
    },
    start() {
      return () => {
        clearTimeout(timer);
        stopped = false;
      };
    },
  });
}
const router = createRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .transformer(superjson)
  .queries({
    hello(ctx, input?: string) {
      return `hello ${input ?? 'world'}`;
    },
  })
  .merge(
    'messages.',
    createRouter()
      .queries({
        list: async () => {
          return prisma.message.findMany({
            orderBy: {
              createdAt: 'asc',
            },
          });
        },
      })
      .mutations({
        create: async (_ctx, text: string) => {
          const msg = await createMessage(text);
          return msg;
        },
      })
      .subscriptions({
        newMessages: (_ctx, { timestamp }: { timestamp: Date }) => {
          return subscriptionPullFatory<Message[]>({
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

export default trpc.createNextApiHandler({ router, createContext });
