import { AnyRouter } from '@trpc/server';
import { IncomingMessage, ServerResponse } from 'http';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
  nodeHTTPRequestHandler,
} from './node-http';

export interface FastifyTRPCPluginOptions<TRouter extends AnyRouter> {
  prefix?: string;
  trpcOptions: NodeHTTPHandlerOptions<TRouter, IncomingMessage, ServerResponse>;
}

export type CreateFastifyContextOptions = NodeHTTPCreateContextFnOptions<
  IncomingMessage,
  ServerResponse
>;

export function fastifyTRPCPlugin<TRouter extends AnyRouter>(
  fastify: FastifyInstance,
  opts: FastifyTRPCPluginOptions<TRouter>,
  done: (err?: Error) => void,
) {
  fastify.all(`${opts.prefix ?? ''}/:path`, (req, res) => {
    nodeHTTPRequestHandler({
      ...opts.trpcOptions,
      ...patchHandlerArguments(req, res),
      path: (req.params as any).path,
    });
  });

  done();
}

// https://github.com/trpc/trpc/issues/524
// https://github.com/trpc/trpc/issues/1406
function patchHandlerArguments(req: FastifyRequest, res: FastifyReply) {
  const reqNode = req.raw;
  const resNode = res.raw;

  (reqNode as any).body = req.body;

  Object.keys(res.getHeaders()).forEach((headerKey: string) => {
    const headerValue = res.getHeader(headerKey);

    if (headerValue) {
      resNode.setHeader(headerKey, headerValue);
    }
  });

  return { req: reqNode, res: resNode };
}
