import { Duration } from 'effect';
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
import type { SocketDrains } from '../sockets/index.ts';
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
  /**
   * When an event stream ends (`sse.maxDuration`), and how long before
   * that it asks its client to reconnect; `undefined` never ends one.
   */
  readonly sseLifetime:
    | { readonly end: Duration.Duration; readonly notice: Duration.Duration }
    | undefined;
  /** What drains the handler's connections, event streams included. */
  readonly drains: SocketDrains;
  readonly batch: { readonly maxItems: number } | undefined;
}

const sseLifetime = (
  sse:
    | {
        readonly maxDuration?: Duration.Input | undefined;
        readonly reconnectNotice?: Duration.Input | undefined;
      }
    | undefined,
): HttpHandler['sseLifetime'] => {
  if (sse?.maxDuration === undefined) return undefined;
  const end = Duration.fromInputUnsafe(sse.maxDuration);
  if (Duration.isNegative(end)) {
    throw new Error(
      `sse.maxDuration must be zero or more, got ${Duration.format(end)}`,
    );
  }
  if (sse.reconnectNotice === undefined) {
    return { end, notice: Duration.min(end, Duration.seconds(5)) };
  }
  const notice = Duration.fromInputUnsafe(sse.reconnectNotice);
  if (Duration.isNegative(notice)) {
    throw new Error(
      `sse.reconnectNotice must be zero or more, got ${Duration.format(notice)}`,
    );
  }
  if (Duration.isGreaterThan(notice, end)) {
    throw new Error(
      `sse.reconnectNotice must be at most sse.maxDuration, got ${Duration.format(notice)} for ${Duration.format(end)}`,
    );
  }
  return { end, notice };
};

/** @internal */
export const makeHttpHandler = (
  opts: {
    readonly router: AnyRouter;
    readonly transformer?: AnyTransformer | undefined;
    readonly endpoint?: string | undefined;
    readonly experimental_pathSeparator?: PathSeparator | undefined;
    readonly maxBodySize?: number | undefined;
    readonly sse?:
      | {
          readonly pingInterval?: Duration.Input | false | undefined;
          readonly maxDuration?: Duration.Input | undefined;
          readonly reconnectNotice?: Duration.Input | undefined;
        }
      | undefined;
    readonly batch?: false | { readonly maxItems: number } | undefined;
  },
  core: HandlerCore,
  drains: SocketDrains,
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
    sseLifetime: sseLifetime(opts.sse),
    drains,
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
