/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { openai } from '@ai-sdk/openai';
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { streamText } from 'ai';
import cors from 'cors';
import { z } from 'zod';

const t = initTRPC.create({
  experimental: {
    outputResponse: true,
  },
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  chat: publicProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(['system', 'user', 'assistant', 'data']),
            content: z.string(),
          }),
        ),
      }),
    )
    .query(async (opts) => {
      const response = streamText({
        model: openai('gpt-4o'),
        system: 'You are a helpful assistant.',
        messages: opts.input.messages,
      });

      return response.toDataStreamResponse();
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
    console.log('context 3');
    return {};
  },
}).listen(2022);
