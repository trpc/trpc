import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { PluginArgs } from '..';

type tRPCPagesPluginFunction<
  Env = unknown,
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = PagesPluginFunction<Env, Params, Data, PluginArgs>;

export const onRequest: tRPCPagesPluginFunction = async ({
  request,
  pluginArgs,
}) => {
  // return new Response('Hello, world!');
  return fetchRequestHandler({
    endpoint: pluginArgs.endPoint ?? '/api/trpc',
    req: request,
    router: pluginArgs.router,
  });
};
