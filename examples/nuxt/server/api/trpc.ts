import nodeHTTP from '@trpc/server/adapters/node-http';

import { IncomingMessage, ServerResponse } from 'http';
import { createContext } from '../context';
import { appRouter } from '../routers/_app';

export type CreateHTTPContextOptions = nodeHTTP.NodeHTTPCreateContextFnOptions<
  IncomingMessage,
  ServerResponse
>;

export default async function trpcHandler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (!req.url) {
    throw new Error('Something wrong');
  }
  const path = req.url.substr('/trpc/'.length);
  console.log({ path });
  await nodeHTTP.nodeHTTPRequestHandler({
    router: appRouter,
    req,
    res,
    path,
    createContext,
  });
}
