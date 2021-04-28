import * as trpc from '@trpc/server';
import * as z from 'zod';
import * as trpcNext from '@trpc/server/adapters/next';
import { inferAsyncReturnType } from '@trpc/server';
import { postsRouter } from './posts';

// The app's context - is generated for each incoming request
export async function createContext({
  req,
  res,
}: trpcNext.CreateNextContextOptions) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  // This is just an example of something you'd might want to do in your ctx fn
  async function getUserFromHeader() {
    if (req.headers.authorization) {
      // const user = await decodeJwtToken(req.headers.authorization.split(' ')[1])
      // return user;
    }
    return null;
  }
  const user = await getUserFromHeader();

  return {
    req,
    user,
  };
}
type Context = inferAsyncReturnType<typeof createContext>;

export function createRouter() {
  return trpc.router<Context>();
}

// Important: only use this export with SSR/SSG
export const appRouter = createRouter()
  .formatError(({ defaultShape, error }) => {
    return {
      ...defaultShape,
      zodError:
        error.code === 'BAD_USER_INPUT' &&
        error.originalError instanceof z.ZodError
          ? error.originalError.flatten()
          : null,
    };
  })
  .middleware(({ ctx }) => {
    console.log('received request', {
      url: ctx.req.url,
      'x-ssr': ctx.req.headers['x-ssr'],
    });
  })
  // Create procedure at path 'hello'
  .query('hello', {
    // using zod schema to validate and infer input values
    input: z
      .object({
        text: z.string().optional(),
      })
      .optional(),
    resolve({ input }) {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    },
  })
  .merge('posts.', postsRouter);

// Exporting type _type_ AppRouter only exposes types that can be used for inference
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
    }
  },
});
