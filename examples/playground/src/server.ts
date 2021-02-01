import * as trpc from '@trpc/server';
import { EventEmitter } from 'events';
import * as z from 'zod';

// ---------- create context
const createContext = ({ req, res }: trpc.CreateHttpContextOptions) => {
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
type Context = trpc.inferAsyncReturnType<typeof createContext>;

function createRouter() {
  return trpc.router<Context>();
}

// --------- create routes etc

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
export const rootRouter = createRouter()
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

export type RootRouter = typeof rootRouter;

async function main() {
  const server = trpc.createHttpServer({
    router: rootRouter,
    createContext,
  });
  server.listen(2021);
}

main();
