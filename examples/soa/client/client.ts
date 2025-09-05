import { createTRPCClient, httpBatchLink, splitLink } from '@trpc/client';
import type { AppRouter } from '../faux-gateway/index.js';

const servers = {
  serverA: 'http://localhost:2021',
  serverB: 'http://localhost:2022',
} as const satisfies Record<string, string>;

export const client = createTRPCClient<AppRouter>({
  links: [
    // This custom link intercepts the operation before it's sent
    // and extracts routing information from the procedure path
    () => {
      return (ctx) => {
        // The procedure path looks like "serverA.users.list" or "serverB.posts.create"
        // We split it to get the server name from the first segment

        const pathParts = ctx.op.path.split('.');
        const serverName = pathParts.shift(); // Get serverA/serverB

        // Continue the chain with modified operation:
        // - Remove the server prefix from the path
        // - Store the server name in context for the split link to use
        return ctx.next({
          ...ctx.op,
          path: pathParts.join('.'),
          context: {
            ...ctx.op.context,
            serverName,
          },
        });
      };
    },
    // The split link routes requests to different servers based on the serverName
    splitLink({
      // Use the serverName we stored in context to determine which server to use
      condition: (op) => op.context.serverName as keyof typeof servers,
      options: {
        // Each server gets its own httpBatchLink with the appropriate URL
        serverA: httpBatchLink({
          url: servers.serverA,
        }),
        serverB: httpBatchLink({
          url: servers.serverB,
        }),
      },
    }),
  ],
});
