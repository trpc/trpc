import fastify from 'fastify';
import ws from 'fastify-websocket';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { createContext } from './router/context';
import { appRouter } from './router';

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

  server.register(ws);
  server.register(fastifyTRPCPlugin, {
    prefix,
    useWSS: true,
    trpcOptions: { router: appRouter, createContext },
  });

  server.get('/', async () => {
    return { hello: 'wait-on 💨' };
  });

  server.get('/hello', async () => {
    return { hello: 'GET' };
  });

  server.post<{ Body: { text: string; life: number } }>(
    '/hello',
    async ({ body }) => {
      console.log('BODY:', typeof body, body);
      return { hello: 'POST', body };
    },
  );

  const stop = () => server.close();
  const start = async () => {
    try {
      await server.listen(port);
      console.log('listening on port', port);
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  };

  return { server, start, stop };
}
