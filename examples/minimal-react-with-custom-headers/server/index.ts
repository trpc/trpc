/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { initTRPC } from '@trpc/server';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import http from 'http';

const t = initTRPC.context<{ token?: string }>().create();

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  greeting: publicProcedure.query(({ ctx }) => {
    // This is what you're returning to your client
    return {
      text: `hello user with token ${ctx.token ?? 'unknown'}`,
      // 💡 Tip: Try adding a new property here and see it propagate to the client straight-away
    };
  }),
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// create handler
const handler = createHTTPHandler({
  router: appRouter,
  createContext({ req }) {
    return { token: req.headers.authorization };
  },
});

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }
  handler(req, res);
});

server.listen(2022);
