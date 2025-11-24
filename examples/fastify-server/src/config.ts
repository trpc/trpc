import type { ServerOptions } from './server/server.ts';

export const serverConfig: ServerOptions = {
  dev: false,
  port: 2022,
  prefix: '/trpc',
};
