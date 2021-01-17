import { Router } from './lib/router';
import express from 'express';
import bodyParser from 'body-parser';

let id = 0;

const db = {
  posts: [
    {
      id: ++id,
      title: 'hello',
    },
  ],
};

type Context = {
  user?: {
    name: String;
  };
};

function createRouter() {
  return new Router<Context>();
}

async function createContext(req: express.Request): Promise<Context> {
  let ctx: Context = {};
  if (typeof req.headers.name === 'string') {
    ctx.user = {
      name: req.headers.name,
    };
  }
  return ctx;
}

// create router for posts
const posts = createRouter()
  .endpoint(
    'create',
    (
      _,
      input: {
        title: string;
      },
    ) => {
      const post = {
        id: ++id,
        ...input,
      };
      db.posts.push(post);
      return {
        post,
      };
    },
  )
  .endpoint('list', () => db.posts);

// root router to call
const rootRouter = createRouter()
  .endpoint('hello', (ctx, input?: string) => {
    return `hello ${input ?? ctx.user?.name ?? 'world'}`;
  })
  .merge('posts', posts);

export type RootRouter = typeof rootRouter;
export type RootRouterRoutes = keyof RootRouter['_endpoints'];

async function main() {
  // express implementation
  const app = express();
  app.use(bodyParser.json());

  app.use('/trpc', async (req, res, next) => {
    try {
      const endpoint = req.path.substr(1);
      if (!rootRouter.has(endpoint)) {
        console.log(`❌ couldn't find endpoint "${endpoint}"`);
        console.log('routes:', Object.keys(rootRouter._endpoints).sort());
        next();
        return;
      }
      let args = req.body?.args ?? JSON.parse(req.query.args as string);
      console.log('⬅️ ', req.method, endpoint, 'args:', args);
      const ctx = await createContext(req);
      const handle = rootRouter.handler(ctx);

      const json = await handle(endpoint as any, ...args);
      res.json(json);
    } catch (err) {
      next(err);
    }
  });
  app.listen(2021, () => {
    console.log('listening on port 2021');
  });
}

main();
