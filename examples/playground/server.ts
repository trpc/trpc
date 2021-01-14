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
  .compose('posts', posts);

export type RootRouter = typeof rootRouter;

async function main() {
  // const ctx: Context = {
  //   user: {
  //     name: 'Alex',
  //   },
  // };

  // const handle = rootRouter.handler(ctx);

  // // testing playground
  // {
  //   const res = await handle('hello', 'test');
  //   console.log(res);
  // }
  // {
  //   const res = await handle('hello');
  //   console.log(res);
  // }
  // {
  //   const res = await handle('posts/create', {
  //     title: 'test',
  //   });
  //   console.log(res);
  // }
  // // express implementation
  const app = express();
  app.use(bodyParser.json());

  app.use('/trpc', async (req, res, next) => {
    try {
      const endpoint = req.path.substr(1);
      if (!rootRouter.has(endpoint)) {
        console.log(`❌ couldn't find endpoint "${endpoint}"`);
        next();
        return;
      }
      let args = req.body?.args ?? req.query.args;
      if (!Array.isArray(args)) {
        args = [args];
      }
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
