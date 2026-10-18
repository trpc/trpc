// Usage (from next/spikes): node mcp/serve.ts [--port 3333] [--user name]
//
// Serves the spike's blog router as an MCP server at http://localhost:<port>/mcp,
// for a real client: `npx @modelcontextprotocol/inspector`, or
// `claude mcp add --transport http blog http://localhost:3333/mcp`.
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Console, Effect, Layer, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { runScript } from '../kit.ts';
import { appRouter, freshPosts } from './app.ts';
import { createMcpHandler } from './mcp.ts';

const serve = Command.make(
  'serve',
  {
    port: Flag.Int('port').pipe(Flag.withDefault(3333)),
    user: Flag.String('user').pipe(Flag.optional),
  },
  (opts) =>
    Effect.gen(function* () {
      freshPosts();
      const user = Option.getOrNull(
        Option.map(opts.user, (name) => ({ name, admin: true })),
      );
      const mcp = createMcpHandler({
        router: appRouter,
        serverInfo: { name: 'trpc-blog', version: '0.0.0' },
        instructions: 'A blog. Read posts before changing them.',
        createContext: () => ({ user }),
      });
      const app = Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const web = yield* HttpServerRequest.toWeb(request);
        if (new URL(web.url).pathname !== '/mcp') {
          return HttpServerResponse.empty({ status: 404 });
        }
        return HttpServerResponse.fromWeb(
          yield* Effect.promise(() => mcp.fetch(web)),
        );
      });
      yield* Console.log(
        `MCP server on http://localhost:${opts.port}/mcp with tools: ${mcp.tools
          .map((t) => t.name)
          .join(', ')}`,
      );
      return yield* Layer.launch(
        HttpServer.serve(app).pipe(
          Layer.provide(
            NodeHttpServer.layer(createServer, { port: opts.port }),
          ),
        ),
      );
    }),
);

runScript(import.meta, serve);
