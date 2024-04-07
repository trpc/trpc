/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { z } from 'zod';

const t = initTRPC.create();

const publicProcedure = t.procedure;
const router = t.router;

function asType<TOut>(input: unknown): T {
  return input as TOut;
}

const appRouter = router({
  formData: publicProcedure.input(asType<FormData>).mutation(({ input }) => {
    console.log('FormData: ', input);

    return {
      text: 'ACK',
    };
  }),
  file: publicProcedure.input(asType<File>).mutation(({ input }) => {
    console.log('File: ', input);

    return {
      text: 'ACK',
    };
  }),
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// create server
createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext() {
    return {};
  },
}).listen(2022);
