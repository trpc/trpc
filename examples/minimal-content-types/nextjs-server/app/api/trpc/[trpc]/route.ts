/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { initTRPC, parseOctetInput } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { zfd } from 'zod-form-data';

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
  formWithFile: publicProcedure
    .input(
      zfd.formData({
        file: zfd.file(),
      }),
    )
    .mutation(({ input }) => {
      console.log('FormData: ', input);
      console.log('File: ', input.file);
    }),
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// create server
const handler = (req: NextRequest) =>
  fetchRequestHandler({
    req,
    router: appRouter,
    endpoint: '/api/trpc',
    responseMeta: () => ({
      headers: corsHeaders,
    }),
  });

export { handler as GET, handler as POST };

/**
 * Super basic CORS just to allow the Vite client to hit this endpoint
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const OPTIONS = () =>
  new Response(null, {
    headers: corsHeaders,
    status: 204,
  });
