import bodyParser from 'body-parser';
import express from 'express';
import * as trpc from './lib';
import { inferAsyncReturnType } from './lib';
import {
  CreateExpressContextOptions,
  createExpressMiddleware,
} from './lib/createExpressMiddleware';

let id = 0;

const db = {
  posts: [
    {
      id: ++id,
      title: 'hello',
    },
  ],
};

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

// root router to call
const rootRouter = createRouter()
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
  );

export type RootRouter = typeof rootRouter;

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
