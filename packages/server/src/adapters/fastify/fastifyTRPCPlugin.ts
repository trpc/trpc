/// <reference types="@fastify/websocket" />
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FastifyHandlerOptions } from '.';
import { AnyRouter } from '../../core';
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

  let prefix = opts.prefix ?? '';

  // https://github.com/fastify/fastify-plugin/blob/fe079bef6557a83794bf437e14b9b9edb8a74104/plugin.js#L11
  // @ts-expect-error property 'default' does not exists on type ...
  if (typeof fastifyTRPCPlugin.default !== 'function') {
    prefix = ''; // handled by fastify internally
  }

  fastify.all(`${prefix}/:path`, async (req, res) => {
    const path = (req.params as any).path;
    await fastifyRequestHandler({ ...opts.trpcOptions, req, res, path });
  });

  if (opts.useWSS) {
    applyWSSHandler<TRouter>({
      ...(opts.trpcOptions as unknown as WSSHandlerOptions<TRouter>),
      wss: fastify.websocketServer,
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    fastify.get(prefix ?? '/', { websocket: true }, () => {});
  }

  done();
}
