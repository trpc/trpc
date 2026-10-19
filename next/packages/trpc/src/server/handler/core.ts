import {
  Context,
  Effect,
  ManagedRuntime,
  type Exit,
  type Layer,
  type Tracer,
} from 'effect';
import { HttpServerRequest } from 'effect/http';
import {
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../../internal/error.ts';
import type { MaybePromise, ProcedureType } from '../../internal/types.ts';
import {
  callProcedure,
  isUnexpectedError,
  runtimeServices,
  unexpectedError,
} from '../execution/index.ts';
import type { CreateContextOpts, OnErrorOpts } from './fetch.ts';
import type { ResponseHandle, AnyProcedure } from '../procedures/index.ts';
import type { Transport } from '../sockets/index.ts';

/** @internal */
export interface CoreOptions {
  createContext?: (opts: CreateContextOpts<any>) => MaybePromise<object>;
  layer?: Layer.Layer<any, any, never>;
  exposeUnexpectedErrors?: boolean;
  onError?: (opts: OnErrorOpts) => void;
}

/** @internal */
export interface RunOpts {
  procedure: AnyProcedure;
  path: string;
  ctx: object;
  input: unknown;
  signal: AbortSignal;
  response: ResponseHandle;
  lastEventId?: string | undefined;
  /** Added to the layer's services for this call. */
  services?: Context.Context<never> | undefined;
  /**
   * The HTTP request (or a socket's upgrade request), provided to the call
   * as `HttpServerRequest`. In-process calls have none.
   */
  request?: HttpServerRequest.HttpServerRequest | undefined;
  /** The span the call's `trpc.<path>` span is a child of. */
  parent?: Tracer.AnySpan | undefined;
  /** An unbatched HTTP call, which may return an `HttpServerResponse`. */
  allowResponse?: boolean | undefined;
}

/** @internal */
export interface MakeContextOpts {
  request: HttpServerRequest.HttpServerRequest;
  platform?: unknown;
  calls: ReadonlyArray<{ path: string; type: ProcedureType }>;
  signal: AbortSignal;
  transport?: Transport;
  connectionParams?: Record<string, unknown> | undefined;
}

/** What every handler shares: ctx, services, masking and `onError`. @internal */
export interface HandlerCore {
  /** Runs a call in the calling fiber; interrupting it interrupts the call. */
  readonly run: (
    opts: RunOpts,
  ) => Effect.Effect<Exit.Exit<unknown, AnyTrpcError>>;
  /** `createContext` as an Effect, failing with what it threw. */
  readonly makeContext: (
    opts: MakeContextOpts,
  ) => Effect.Effect<object, AnyTrpcError>;
  /** Masks unexpected errors unless `exposeUnexpectedErrors`. */
  readonly publicError: (err: AnyTrpcError) => AnyTrpcError;
  readonly report: (
    err: AnyTrpcError,
    request: HttpServerRequest.HttpServerRequest,
    path?: string,
    type?: ProcedureType,
  ) => void;
  readonly dispose: () => Promise<void>;
}

const isDev = () => {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.['NODE_ENV'];
  return env === 'development' || env === 'test';
};

/** @internal */
export function createHandlerCore(opts: CoreOptions): HandlerCore {
  const expose = opts.exposeUnexpectedErrors ?? isDev();
  const runtime = opts.layer ? ManagedRuntime.make(opts.layer) : undefined;
  /** The layer's services, built once by the runtime on first use. */
  const services = runtimeServices(runtime);

  /** The call with its services in place of the running fiber's. */
  const call = (o: RunOpts) =>
    Effect.flatMap(services, (layer) => {
      let context = layer;
      if (o.request) {
        context = Context.add(
          context,
          HttpServerRequest.HttpServerRequest,
          o.request,
        );
      }
      if (o.services) context = Context.merge(context, o.services);
      return Effect.updateContext<unknown, AnyTrpcError, any, never>(
        callProcedure(o),
        () => context,
      );
    });

  const createContext = (o: MakeContextOpts): MaybePromise<object> =>
    opts.createContext
      ? opts.createContext({
          request: o.request,
          platform: o.platform,
          info: {
            calls: o.calls,
            signal: o.signal,
            transport: o.transport ?? 'http',
            connectionParams: o.connectionParams,
          },
        })
      : {};
  const noContext = Effect.succeed({});

  return {
    run: (o) => Effect.exit(call(o)),
    makeContext: (o) =>
      opts.createContext
        ? Effect.tryPromise({
            try: async () => await createContext(o),
            catch: (cause) =>
              isTrpcError(cause) ? cause : unexpectedError(cause),
          })
        : noContext,
    publicError: (err) =>
      isUnexpectedError(err) && !expose
        ? new TrpcError.InternalServerError({
            message: 'Internal server error',
          })
        : err,
    report: (error, request, path, type) => {
      opts.onError?.({ error, path, type, request });
    },
    dispose: async () => {
      await runtime?.dispose();
    },
  };
}
