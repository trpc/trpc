import * as trpc from '@trpc/server';
import { Subscription, SubscriptionEmit } from '@trpc/server';

// db
let id = 0;
const db = {
  messages: [createMessage('initial message')],
};
function createMessage(text: string) {
  const msg = {
    id: ++id,
    text,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return msg;
}

async function getMessagesAfter(timestamp: number) {
  const msgs = db.messages.filter(
    (msg) => msg.updatedAt > timestamp || msg.createdAt > timestamp
  );

  return msgs;
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
          return db.messages;
        },
      })
      .mutations({
        create: async (_ctx, text: string) => {
          const msg = createMessage(text);
          db.messages.push(msg);
          return msg;
        },
      })
      .subscriptions({
        newMessages: (_ctx, { timestamp }: { timestamp: number }) => {
          type Message = typeof db['messages'][number];

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
      })
  );

export const chatRouter = router;
export type ChatRouter = typeof router;

export default trpc.createNextApiHandler({ router, createContext });
