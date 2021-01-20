import bodyParser from 'body-parser';
import { EventEmitter } from 'events';
import express from 'express';
import * as trpc from './lib/server';
import { inferAsyncReturnType } from './lib/server';
import {
  CreateExpressContextOptions,
  createExpressMiddleware,
} from './lib/server/createExpressMiddleware';
import { Subscription } from './lib/server/subscription';

let id = 0;

const ee = new EventEmitter();

const db = {
  posts: [
    {
      id: ++id,
      title: 'hello',
    },
  ],
  messages: [createMessage('initial message')],
};
async function getMessagesAfter(timestamp: number) {
  const msgs = db.messages.filter(
    (msg) => msg.updatedAt > timestamp || msg.createdAt > timestamp,
  );

  return msgs;
}
function createMessage(text: string) {
  const msg = {
    id: ++id,
    text,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  ee.emit('newMessage', msg);
  return msg;
}

function createRouter() {
  return trpc.router<Context>();
}

const createContext = ({ req, res }: CreateExpressContextOptions) => {
  const getUser = () => {
    if (req.headers.authorization !== 'secret') {
      return null;
    }
    return {
      name: 'alex',
    };
  };

  return {
    req,
    res,
    user: getUser(),
  };
};
type Context = inferAsyncReturnType<typeof createContext>;

// create router for posts
const posts = createRouter()
  .mutations({
    create: (
      ctx,
      input: {
        title: string;
      },
    ) => {
      const post = {
        id: ++id,
        ...input,
      };
      db.posts.push(post);
      ctx.res.status(201);
      return post;
    },
  })
  .queries({
    list: () => db.posts,
  });

const messages = createRouter()
  .queries({
    list: () => db.messages,
  })
  .mutations({
    add: async (_ctx, text: string) => {
      const msg = createMessage(text);

      db.messages.push(msg);

      return msg;
    },
  })
  .subscriptions({
    newMessages: (_ctx, { timestamp }: { timestamp: number }) => {
      type Message = typeof db['messages'][number];
      const sub = new Subscription<Message[]>({
        async getInitialData() {
          const sinceLast = await getMessagesAfter(timestamp);
          return sinceLast.length ? sinceLast : null;
        },
      });

      const onMessage = (data: Message) => {
        sub.events.emit('data', [data]);
      };
      sub.attachEvents({
        on: () => ee.on('newMessage', onMessage),
        off: () => ee.off('newMessage', onMessage),
      });

      return sub;
    },
  });

// root router to call
export const rootRouter = createRouter()
  .queries({
    hello: (ctx, input?: string) => {
      return `hello ${input ?? ctx.user?.name ?? 'world'}`;
    },
  })
  .merge('posts/', posts)
  .merge(
    'admin/',
    createRouter().queries({
      secret: (ctx) => {
        if (!ctx.user) {
          throw trpc.httpError.unauthorized();
        }
        if (ctx.user?.name !== 'alex') {
          throw trpc.httpError.forbidden();
        }
        return {
          secret: 'sauce',
        };
      },
    }),
  )
  .merge('messages/', messages);

export type RootRouter = typeof rootRouter;

async function main() {
  const handler = rootRouter.createQueryHandler({} as any);
  console.log(await handler('hello', 'world'));

  // message testing
  // {
  //   const subs = rootRouter.createSubscriptionHandler({} as any);
  //   const sub = await subs('messages/newMessages');
  //   setTimeout(() => {
  //     rootRouter.createMutationHandler({} as any)(
  //       'messages/add',
  //       'hello there',
  //     );
  //   }, 10);
  //   console.log('awaitng message');
  //   console.log('messages', await sub.onceDataAndStop());
  // }
  // express implementation
  const app = express();
  app.use(bodyParser.json());

  app.use((req, _res, next) => {
    // request logger
    console.log('⬅️ ', req.method, req.path, req.body ?? req.query);

    next();
  });

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: rootRouter,
      createContext,
    }),
  );
  app.listen(2021, () => {
    console.log('listening on port 2021');
  });
}

main();
