import ws from '@fastify/websocket';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { appRouter } from './router';
import { createContext } from './router/context';

export interface ServerOptions {
  dev?: boolean;
  port?: number;
  prefix?: string;
}

export function createServer(opts: ServerOptions) {
  const dev = opts.dev ?? true;
  const port = opts.port ?? 3000;
  const prefix = opts.prefix ?? '/trpc';
  const server = fastify({ logger: dev });

  // Browsers don't apply CORS to WebSockets, so only accept pages from these origins
  const allowedOrigins = process.env.WS_ALLOWED_ORIGINS?.split(',') ?? [
    `http://localhost:${port}`,
  ];

  void server.register(ws, {
    options: {
      verifyClient: ({ origin }, callback) => {
        // Node clients like `src/client` don't send an `Origin` header
        callback(!origin || allowedOrigins.includes(origin), 403);
      },
    },
  });
  void server.register(fastifyTRPCPlugin, {
    prefix,
    useWSS: true,
    trpcOptions: { router: appRouter, createContext },
  });

  server.get('/', async () => {
    return { hello: 'wait-on 💨' };
  });

  const stop = async () => {
    await server.close();
  };
  const start = async () => {
    try {
      await server.listen({ port });
      console.log('listening on port', port);
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  };

  return { server, start, stop };
}
