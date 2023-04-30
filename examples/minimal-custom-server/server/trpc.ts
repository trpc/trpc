import { initTRPC, type inferAsyncReturnType } from '@trpc/server';
import { CreateCustomContextOptions } from './custom-adapter'; 

// export createContext that takes CreateCustomContextOptions
export const createContext = async ({req, res}: CreateCustomContextOptions) => {
  return {
    req,
    res
  };
};

type Context = inferAsyncReturnType<typeof createContext>;

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */

const runCustomMethod = t.middleware(({next, ctx}) => {
  ctx.res.customMethod('Procedure middleware');
  return next({
    ctx: { // update or add more props to the ctx
      woop: 'WOOP!',
    }
  })
})

export const router = t.router;
export const publicProcedure = t.procedure.use(runCustomMethod);
