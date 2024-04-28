/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { parseOctetInput } from '@trpc/server/http';
import cors from 'cors';
import { z } from 'zod';

const t = initTRPC.create();

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Input parsers set! (should expect the input to be loaded into memory)
  formData: publicProcedure
    .input(z.instanceof(FormData))
    .mutation(({ input }) => {
      const object = {} as Record<string, unknown>;
      input.forEach((value, key) => (object[key] = value));

      console.log('FormData: ', object, input);

      return {
        text: 'ACK',
        data: object,
      };
    }),
  file: publicProcedure
    .input(parseOctetInput<File>())
    .mutation(async ({ input }) => {
      const chunks = [];

      const reader = input.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
      }

      const content = Buffer.concat(chunks).toString('utf-8');

      console.log('File: ', content);

      return {
        text: 'ACK',
        data: content,
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
  onError(opts) {
    console.error('Error', opts.error);
  },
}).listen(2022);
