/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
/// <reference types="@fastify/websocket" />
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
// @trpc/server
import type { AnyRouter } from '../../@trpc/server';
// @trpc/server/http
import type { NodeHTTPCreateContextFnOptions } from '../node-http';
// @trpc/server/ws
import {
  broadcastReconnectNotificationToClients,
  getWSConnectionHandler,
  handleKeepAlive,
  jsonEncoder,
} from '../ws';
import type { ReconnectNotificationTarget, WSSHandlerOptions } from '../ws';
import type { FastifyHandlerOptions } from './fastifyRequestHandler';
import { fastifyRequestHandler } from './fastifyRequestHandler';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Ask every connected WebSocket client to reconnect, e.g. before shutting
     * down the server. Only sends to clients when the plugin was registered
     * with `useWSS: true`.
     */
    broadcastReconnectNotification: () => void;
  }
}

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
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function (_, body, _done) {
      _done(null, body);
    },
  );
  fastify.removeContentTypeParser('multipart/form-data');
  fastify.addContentTypeParser(
    'multipart/form-data',
    {},
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

  const connectedClients = new Set<ReconnectNotificationTarget>();
  const wssOptions = opts.trpcOptions as unknown as WSSHandlerOptions<TRouter>;
  const encoder = wssOptions.experimental_encoder ?? jsonEncoder;

  if (opts.useWSS) {
    const trpcOptions = wssOptions;
    const onConnection = getWSConnectionHandler<TRouter>({
      ...trpcOptions,
    });

    fastify.get(prefix ?? '/', { websocket: true }, (socket, req) => {
      connectedClients.add(socket);
      socket.once('close', () => {
        connectedClients.delete(socket);
      });

      onConnection(socket, req.raw);
      if (trpcOptions?.keepAlive?.enabled) {
        const { pingMs, pongWaitMs } = trpcOptions.keepAlive;
        handleKeepAlive(socket, pingMs, pongWaitMs);
      }
    });
  }

  fastify.decorate('broadcastReconnectNotification', () => {
    broadcastReconnectNotificationToClients(connectedClients, encoder);
  });

  done();
}
