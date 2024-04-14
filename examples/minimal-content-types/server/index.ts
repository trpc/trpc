/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import type { Readable } from 'stream';
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { z } from 'zod';

const t = initTRPC.create();

const publicProcedure = t.procedure;
const router = t.router;

function asType<TOut>(input: unknown): TOut {
  console.log('asType', input);
  return input as TOut;
}

const appRouter = router({
  // Input parsers set! (should expect the input to be loaded into memory)
  formData: publicProcedure.input(asType<FormData>).mutation(({ input }) => {
    const object = {} as Record<string, unknown>;
    input.forEach((value, key) => (object[key] = value));

    console.log('FormData: ', object, input);

    return {
      text: 'ACK',
      data: object,
    };
  }),
  file: publicProcedure.input(asType<Readable>).mutation(async ({ input }) => {
    const chunks = [];
    for await (const chunk of input) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString('utf-8');

    console.log('File: ', content);

    return {
      text: 'ACK',
      data: content,
    };
  }),

  // No input parser set! (should expect the input never gets loaded into memory)
  // formData: publicProcedure.mutation(({ input }) => {
  //   if (input) {
  //     throw new Error('Input should not be loaded into memory!');
  //   }

  //   return {
  //     text: 'ACK',
  //   };
  // }),
  // file: publicProcedure.mutation(async ({ input }) => {
  //   if (input) {
  //     throw new Error('Input should not be loaded into memory!');
  //   }

  //   return {
  //     text: 'ACK',
  //   };
  // }),
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
