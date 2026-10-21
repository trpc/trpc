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
import { timerOption } from '../../internal/duration.ts';
import type { ProcedureType } from '../../internal/types.ts';
import {
  jsonTransformer,
  type AnySerializer,
} from '../../transformer/index.ts';
import { unexpectedError } from '../execution/index.ts';
import type { AnyRouter } from '../procedures/index.ts';
import type { HandlerCore } from './core.ts';

/**
 * A fetch handler's HTTP side: its options, resolved once, and the core
 * its calls run on. Every request module takes it first. @internal
 */
export interface HttpHandler {
  readonly router: AnyRouter;
  readonly core: HandlerCore;
  readonly serializer: AnySerializer;
  /** `/trpc`, or `/` for every path. */
  readonly endpoint: string;
  /** What procedure paths follow. */
  readonly under: string;
  readonly maxBodySize: number;
  /** How often a quiet subscription gets a ping comment; `undefined` sends none. */
  readonly ssePing: Duration.Duration | undefined;
  readonly batch: { readonly maxItems: number } | undefined;
}

/** @internal */
export const makeHttpHandler = (
  opts: {
    readonly router: AnyRouter;
    readonly serializer?: AnySerializer | undefined;
    readonly endpoint?: string | undefined;
    readonly maxBodySize?: number | undefined;
    readonly sse?:
      | { readonly pingInterval?: Duration.Input | false | undefined }
      | undefined;
    readonly batch?: boolean | { readonly maxItems?: number } | undefined;
  },
  core: HandlerCore,
): HttpHandler => {
  const endpoint = `/${(opts.endpoint ?? '/trpc').replace(/^\/+|\/+$/g, '')}`;
  return {
    router: opts.router,
    core,
    serializer: opts.serializer ?? jsonTransformer,
    endpoint,
    under: endpoint === '/' ? '/' : `${endpoint}/`,
    maxBodySize: opts.maxBodySize ?? 1_048_576,
    ssePing: timerOption(opts.sse?.pingInterval, '15 seconds'),
    batch:
      opts.batch === true
        ? { maxItems: 20 }
        : opts.batch
          ? { maxItems: opts.batch.maxItems ?? 20 }
          : undefined,
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
  handler.serializer.serialize(toWireError(handler.core.publicError(err)));

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
