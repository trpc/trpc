import type { Duration } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import {
  isTrpcError,
  toWireError,
  TrpcError,
  type AnyTrpcError,
  type BuiltinErrorCode,
  type BuiltinTag,
  type CodeTags,
  type WireError,
} from '../../internal/error.ts';
import { batchMaxItems } from '../../internal/batch.ts';
import { timerOption } from '../../internal/duration.ts';
import type { PathSeparator } from '../../internal/protocol.ts';
import type { ProcedureType } from '../../internal/types.ts';
import {
  jsonTransformer,
  type AnyTransformer,
} from '../../transformer/index.ts';
import { unexpectedError } from '../execution/index.ts';
import type { AnyRouter } from '../procedures/index.ts';
import type { HandlerCore } from './core.ts';
import { makeUrlPaths, type UrlPaths } from './path-separator.ts';

/**
 * A fetch handler's HTTP side: its options, resolved once, and the core
 * its calls run on. Every request module takes it first. @internal
 */
export interface HttpHandler {
  readonly router: AnyRouter;
  readonly core: HandlerCore;
  readonly transformer: AnyTransformer;
  /** `/trpc`, or `/` for every path. */
  readonly endpoint: string;
  /** What procedure paths follow. */
  readonly under: string;
  /** How URLs spell procedure paths (`experimental_pathSeparator`). */
  readonly paths: UrlPaths;
  readonly maxBodySize: number;
  /** How often a quiet subscription gets a ping comment; `undefined` sends none. */
  readonly ssePing: Duration.Duration | undefined;
  readonly batch: { readonly maxItems: number } | undefined;
}

/** @internal */
export const makeHttpHandler = (
  opts: {
    readonly router: AnyRouter;
    readonly transformer?: AnyTransformer | undefined;
    readonly endpoint?: string | undefined;
    readonly experimental_pathSeparator?: PathSeparator | undefined;
    readonly maxBodySize?: number | undefined;
    readonly sse?:
      | { readonly pingInterval?: Duration.Input | false | undefined }
      | undefined;
    readonly batch?: false | { readonly maxItems: number } | undefined;
  },
  core: HandlerCore,
): HttpHandler => {
  const endpoint = `/${(opts.endpoint ?? '/trpc').replace(/^\/+|\/+$/g, '')}`;
  const maxItems =
    opts.batch === undefined
      ? undefined
      : batchMaxItems('createFetchHandler', opts.batch);
  return {
    router: opts.router,
    core,
    transformer: opts.transformer ?? jsonTransformer,
    endpoint,
    under: endpoint === '/' ? '/' : `${endpoint}/`,
    paths: makeUrlPaths(opts.router, opts.experimental_pathSeparator ?? '.'),
    maxBodySize: opts.maxBodySize ?? Infinity,
    ssePing: timerOption(opts.sse?.pingInterval, '15 seconds'),
    batch: maxItems === undefined ? undefined : { maxItems },
  };
};

/** @internal */
export const protocolError = <
  C extends BuiltinErrorCode,
  T extends BuiltinTag<C> = CodeTags[C],
>(
  code: C,
  message: string,
  tag?: T,
): TrpcError<C, undefined, T> =>
  new TrpcError({ code, message, tag }) as TrpcError<C, undefined, T>;

/** An error as the client sees it: masked, then serialized. @internal */
export const wire = (handler: HttpHandler, err: AnyTrpcError): unknown =>
  handler.transformer.serialize(toWireError(handler.core.publicError(err)));

/** Reports what a deferred value or an event failed with, and masks it. @internal */
export const coerceError =
  (
    handler: HttpHandler,
    request: HttpServerRequest.HttpServerRequest,
    path: string,
    type?: ProcedureType,
  ) =>
  (cause: unknown): WireError => {
    const err = isTrpcError(cause) ? cause : unexpectedError(cause);
    handler.core.report(err, request, path, type);
    return toWireError(handler.core.publicError(err));
  };
