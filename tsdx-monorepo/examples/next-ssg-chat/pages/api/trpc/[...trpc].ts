import * as trpc from '@trpc/server';
import { createNextApiHandler } from '@trpc/server';

// ctx
const createContext = ({ req, res }: trpc.CreateNextContextOptions) => {
  return {
    req,
    res,
  };
};
type Context = trpc.inferAsyncReturnType<typeof createContext>;

function createRouter() {
  return trpc.router<Context>();
}

const router = createRouter().queries({
  hello(ctx, input?: string) {
    return `hello ${input ?? 'world'}`;
  },
});

export default trpc.createNextApiHandler({ router, createContext });
