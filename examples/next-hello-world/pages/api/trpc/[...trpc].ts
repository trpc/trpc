import * as trpc from '@trpc/server';
import * as z from 'zod';
import * as trpcNext from '@trpc/server/dist/adapters/next';

// The app's context - is typically generated for each request
export type Context = {};
const createContext = ({
  req,
  res,
}: trpcNext.CreateNextContextOptions): Context => {
  return {};
};

function createRouter() {
  return trpc.router<Context>();
}
// Important: only use this export with SSR/SSG
export const appRouter = createRouter()
  // Create route at path 'hello'
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
  .mutation('foo', {
    input: z.object({ bar: z.literal('bar') }),
    async resolve({ input }) {
      // do something with your db

      return {};
    },
  });

// Exporting type _type_ AppRouter only exposes types that can be used for inference
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
});
