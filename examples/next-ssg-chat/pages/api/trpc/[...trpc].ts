import * as trpc from '@katt/trpc-server';
import { Subscription, SubscriptionEmit } from '@katt/trpc-server';
import { Message, PrismaClient } from '@prisma/client';
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
export function subscriptionPullFatory<TData>(opts: {
  interval: number;
  pull(emit: SubscriptionEmit<TData>): void | Promise<void>;
}): Subscription<TData> {
  let timer: NodeJS.Timeout;
  let stopped = false;
  const id = Math.random();
  async function _pull(emit: SubscriptionEmit<TData>) {
    console.log('pull', id);
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
    start(emit) {
      console.log('start', id);
      _pull(emit);
      return () => {
        console.log('cancelled', id);
        clearTimeout(timer);
        stopped = true;
      };
    },
  });
}
const router = createRouter()
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
      .mutations({
        create: async (_ctx, text: string) => {
          const msg = await createMessage(text);
          return msg;
        },
      })
      .subscriptions({
        newMessages: (_ctx, { timestamp }: { timestamp: Date }) => {
          return subscriptionPullFatory<Message[]>({
            interval: 1000,
            async pull(emit) {
              const msgs = await getMessagesAfter(timestamp);
              // console.log('messages after', timestamp, msgs.length);
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
