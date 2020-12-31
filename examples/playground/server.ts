import * as bodyParser from 'body-parser';
import express from 'express';
import { trpc } from '../../src/index';

async function createContext({ req }: { req: express.Request }) {
  return {
    req,
  };
}
type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
type Context = ThenArg<ReturnType<typeof createContext>>;

const helloWorldEndpoint = trpc
  .endpoint((ctx: Context) => (data: string) => {
    return {
      hello: `${data}`,
      path: ctx.req.path,
    };
  })
  .authorize(() => () => {
    return true;
  });
const rootRouter = trpc.router().endpoint('hello', helloWorldEndpoint);

export type RootRouter = typeof rootRouter;
// express app serve
const app = express();
app.use(bodyParser.json());

app.use((req, _res, next) => {
  console.log('-------------------');
  console.log(`${req.method} ${req.path}`, {
    query: req.query,
    body: req.body,
  });
  next();
});
app.use('/trpc', async (req, res, next) => {
  try {
    const context = await createContext({ req });
    const { method } = req;
    const { path, args } = method === 'POST' ? req.body : req.query;
    console.log({ path, args, method });
    if (!Array.isArray(path)) {
      throw new Error(`Invalid endpoint`);
    }
    for (const part of path) {
      if (typeof part !== 'string') {
        throw new Error('Invalid endpoint');
      }
    }
    const data = await rootRouter.handle({
      path: path as string[],
      args,
      context,
    });
    res.send({
      path,
      args,
      data,
    });
  } catch (err) {
    // todo
    next(err);
  }
});

const { PORT = 2021 } = process.env;
app.listen(PORT, () => {
  console.log(`Listening on port http://localhost:${PORT}`);
});
