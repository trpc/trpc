/**
 * One router served over RPC (`/trpc`) and as MCP tools (`/mcp`), for agents
 * such as Claude, Cursor or the MCP Inspector.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';
import { toHttpEffect } from '@trpc12/trpc/http';
import { experimental_createMcpHandler } from '@trpc12/trpc/mcp';
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter, type Context } from './router.ts';

export type { AppRouter } from './router.ts';

// A real server verifies a token here; MCP clients sign in with OAuth.
const createContext = (opts: {
  request: { headers: Record<string, string | undefined> };
}): Context => ({ user: opts.request.headers['x-user'] ?? null });

export async function listen(port = 0) {
  const rpc = createFetchHandler({ router: appRouter, createContext });
  const mcp = experimental_createMcpHandler({
    router: appRouter,
    serverInfo: { name: 'blog', version: '1.0.0' },
    instructions: 'A blog. Read posts before changing them.',
    createContext,
  });
  const rpcApp = toHttpEffect(rpc);
  const mcpApp = toHttpEffect(mcp);

  const runtime = ManagedRuntime.make(
    HttpServer.serve(
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
        request.url.startsWith('/mcp') ? mcpApp : rpcApp,
      ),
    ).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url: `${origin}/trpc`,
    async [Symbol.asyncDispose]() {
      await runtime.dispose();
      await Promise.all([rpc.dispose(), mcp.dispose()]);
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(
    `tRPC at ${server.url}, MCP at ${new URL(server.url).origin}/mcp`,
  );
}
