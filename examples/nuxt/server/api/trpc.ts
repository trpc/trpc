/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { nodeHTTPAdapter } from '@trpc/server';
import * as url from 'url';
import { IncomingMessage, ServerResponse } from 'http';
import { createContext } from '../context';
import { appRouter } from '../routers/_app';

export type CreateHTTPContextOptions =
  nodeHTTPAdapter.NodeHTTPCreateContextFnOptions<
    IncomingMessage,
    ServerResponse
  >;

export default async function trpcHandler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const parts = url.parse(req.url!);

  const path = parts.pathname!.substr(1);

  await nodeHTTPAdapter.nodeHTTPRequestHandler({
    router: appRouter,
    req,
    res,
    path,
    createContext,
  });
}
