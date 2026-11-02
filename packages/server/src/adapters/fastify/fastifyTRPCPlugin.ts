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
import { getWSConnectionHandler, type WSSHandlerOptions } from '../ws';
import type { FastifyHandlerOptions } from './fastifyRequestHandler';
import { fastifyRequestHandler } from './fastifyRequestHandler';

/**
 * The options of `fastifyTRPCPlugin`.
 * @see https://trpc.io/docs/server/adapters/fastify#fastify-plugin-options
 */
export interface FastifyTRPCPluginOptions<TRouter extends AnyRouter> {
  /** The path the router is served at, such as `/trpc`. */
  prefix?: string;
  /**
   * Whether to serve WebSockets too. Needs `@fastify/websocket` to be
   * registered first.
   * @see https://trpc.io/docs/server/adapters/fastify#enable-websockets
   */
  useWSS?: boolean;
  /**
   * The router and handler options. `keepAlive`, `dangerouslyDisablePong`
   * and `experimental_encoder` only apply with `useWSS`.
   */
  trpcOptions: FastifyHandlerOptions<TRouter, FastifyRequest, FastifyReply> &
    Pick<
      WSSHandlerOptions<TRouter>,
      'keepAlive' | 'dangerouslyDisablePong' | 'experimental_encoder'
    >;
}

/**
 * What `createContext` gets in the Fastify adapter: `req`, `res` and the
 * request's `info`.
 * @see https://trpc.io/docs/server/adapters/fastify#create-the-context
 */
export type CreateFastifyContextOptions = NodeHTTPCreateContextFnOptions<
  FastifyRequest,
  FastifyReply
>;

/**
 * A Fastify plugin that serves a router over HTTP, and over WebSockets
 * with `useWSS`.
 * @example
 * ```ts
 * server.register(fastifyTRPCPlugin, {
 *   prefix: '/trpc',
 *   trpcOptions: { router: appRouter, createContext },
 * });
 * ```
 * @see https://trpc.io/docs/server/adapters/fastify#create-fastify-server
 */
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

  if (opts.useWSS) {
    const trpcOptions =
      opts.trpcOptions as unknown as WSSHandlerOptions<TRouter>;

    const onConnection = getWSConnectionHandler<TRouter>({
      ...trpcOptions,
    });

    fastify.get(prefix ?? '/', { websocket: true }, (socket, req) => {
      // keepalive is registered by getWSConnectionHandler, which every
      // adapter goes through — registering it here as well gave each socket
      // two ping intervals and two pong-wait timers
      onConnection(socket, req.raw);
    });
  }

  done();
}
