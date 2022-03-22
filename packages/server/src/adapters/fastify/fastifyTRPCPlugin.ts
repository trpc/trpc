/// <reference types="fastify-websocket" />
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FastifyHandlerOptions } from '.';
import { AnyRouter } from '../..';
import { NodeHTTPCreateContextFnOptions } from '../node-http';
import { WSSHandlerOptions, applyWSSHandler } from '../ws';
import { fastifyRequestHandler } from './fastifyRequestHandler';

export interface FastifyTRPCPluginOptions<TRouter extends AnyRouter> {
  prefix?: string;
  useWSS?: boolean;
  trpcOptions: FastifyHandlerOptions<TRouter, FastifyRequest, FastifyReply>;
}

export type CreateFastifyContextOptions = NodeHTTPCreateContextFnOptions<
  FastifyRequest,
  FastifyReply
>;

export function fastifyTRPCPlugin<TRouter extends AnyRouter>(
  fastify: FastifyInstance,
  opts: FastifyTRPCPluginOptions<TRouter>,
  done: (err?: Error) => void,
) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function (_, body, _done) {
      _done(null, body);
    },
  );

  fastify.all(`${opts.prefix ?? ''}/:path`, async (req, res) => {
    const path = (req.params as any).path;
    await fastifyRequestHandler({ ...opts.trpcOptions, req, res, path });
  });

  if (opts.useWSS) {
    applyWSSHandler<TRouter>({
      ...(opts.trpcOptions as WSSHandlerOptions<TRouter>),
      wss: fastify.websocketServer,
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    fastify.get(opts.prefix ?? '/', { websocket: true }, () => {});
  }

  done();
}
