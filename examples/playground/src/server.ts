import bodyParser from 'body-parser';
import { EventEmitter } from 'events';
import express from 'express';
import * as trpc from '@trpc/server';
import * as z from 'zod';

type Context = {};

function createRouter() {
  return trpc.router<Context>();
}

// --------- create routes etc

let id = 0;

const ee = new EventEmitter();
const randomId = () => Math.random().toString(36).substring(2, 15);
const db = {
  posts: [
    {
      id: ++id,
      title: 'hello',
    },
  ],
  messages: [createMessage('initial message')],
};
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

const posts = createRouter()
  .mutation('create', {
    input: z.object({
      title: z.string(),
    }),
    resolve: ({ input }) => {
      const post = {
        id: ++id,
        ...input,
      };
      db.posts.push(post);
      return post;
    },
  })
  .query('list', {
    resolve: () => db.posts,
  });

const messages = createRouter()
  .query('list', {
    resolve: () => db.messages,
  })
  .mutation('add', {
    input: z.string(),
    resolve: async ({ input }) => {
      const msg = createMessage(input);

      db.messages.push(msg);

      return msg;
    },
  });

// root router to call
export const appRouter = createRouter()
  .query('hello', {
    input: z.string().optional(),
    resolve: ({ input, ctx }) => {
      return `hello ${input ?? ctx.user?.name ?? 'world'}`;
    },
  })
  .merge('posts/', posts)
  .merge(
    'admin/',
    createRouter().query('secret', {
      resolve: ({ ctx }) => {
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

export type AppRouter = typeof appRouter;

async function main() {
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
    trpc.createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );
  app.listen(2021, () => {
    console.log('listening on port 2021');
  });
}

main();
