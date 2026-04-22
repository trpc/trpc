/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import {
  byIdInput,
  createResolver,
  dataView,
  type Entity,
} from '@nkzw/fate/server';
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { z } from 'zod';

const t = initTRPC.create();

const publicProcedure = t.procedure;
const router = t.router;

const greetingDataView = dataView<{
  id: string;
  message: string;
  recipient: string;
}>('Greeting')({
  id: true,
  message: true,
  recipient: true,
});

export type Greeting = Entity<typeof greetingDataView, 'Greeting'>;

export const Root = {
  viewer: greetingDataView,
};

const greetingSchema = z.object({
  name: z.string().nullish(),
});

function makeGreeting(name?: string | null) {
  const recipient = name ?? 'world';

  return {
    id: recipient,
    message: `hello ${recipient}`,
    recipient,
  };
}

const appRouter = router({
  greeting: publicProcedure
    // This is the input schema of your procedure
    // 💡 Tip: Try changing this and see type errors on the client straight away
    .input(greetingSchema.nullish())
    .query(({ input }) => {
      return {
        text: `hello ${input?.name ?? 'world'}`,
      };
    }),
  greetingById: publicProcedure.input(byIdInput).query(async ({ input }) => {
    const { resolveMany } = createResolver({
      args: input.args,
      select: input.select,
      view: greetingDataView,
    });

    return await resolveMany(input.ids.map((id: string) => makeGreeting(id)));
  }),
  viewer: publicProcedure
    .input(
      z.object({
        args: greetingSchema.nullish(),
        select: z.array(z.string()),
      }),
    )
    .query(async ({ input }) => {
      const { resolve } = createResolver({
        args: input.args ?? undefined,
        select: input.select,
        view: greetingDataView,
      });

      return await resolve(makeGreeting(input.args?.name));
    }),
});

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
