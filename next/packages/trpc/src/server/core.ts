import {
  Context,
  Effect,
  ManagedRuntime,
  type Exit,
  type Layer,
  type Tracer,
} from 'effect';
import { HttpServerRequest } from 'effect/http';
import { TrpcError, type AnyTrpcError } from '../internal/error.ts';
import type { MaybePromise, ProcedureType } from '../internal/types.ts';
import { callProcedure, isUnexpectedError } from './execute.ts';
import type { CreateContextOpts, OnErrorOpts } from './fetch.ts';
import type { ResponseHandle } from './middleware.ts';
import type { AnyProcedure } from './procedure.ts';
import type { Transport } from './socket.ts';

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
  readonly run: (opts: RunOpts) => Promise<Exit.Exit<unknown, AnyTrpcError>>;
  /** `run` in the calling fiber; interrupting it interrupts the call. */
  readonly runEffect: (
    opts: RunOpts,
  ) => Effect.Effect<Exit.Exit<unknown, AnyTrpcError>>;
  readonly makeContext: (opts: MakeContextOpts) => Promise<object>;
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
  let services: Promise<Context.Context<any>> | undefined;
  let ready: Context.Context<any> | undefined = runtime
    ? undefined
    : (Context.empty() as Context.Context<any>);
  const getServices = () =>
    (services ??= ready
      ? Promise.resolve(ready)
      : runtime!.context().then((context) => (ready = context)));

  const prepare = (o: RunOpts, layer: Context.Context<any>) => {
    let context = layer;
    if (o.request) {
      context = Context.add(
        context,
        HttpServerRequest.HttpServerRequest,
        o.request,
      );
    }
    if (o.services) context = Context.merge(context, o.services);
    return { call: callProcedure(o), context };
  };

  return {
    run: async (o) => {
      const prepared = prepare(o, ready ?? (await getServices()));
      return Effect.runPromiseExitWith(prepared.context)(prepared.call, {
        signal: o.signal,
      });
    },
    runEffect: (o) => {
      const inline = (layer: Context.Context<any>) => {
        const prepared = prepare(o, layer);
        // The call's services replace the server fiber's, as in `run`.
        return Effect.exit(
          Effect.updateContext<unknown, AnyTrpcError, any, never>(
            prepared.call,
            () => prepared.context,
          ),
        );
      };
      return ready
        ? inline(ready)
        : Effect.flatMap(Effect.promise(getServices), inline);
    },
    makeContext: async (o) => {
      if (!opts.createContext) return {};
      return await opts.createContext({
        request: o.request,
        platform: o.platform,
        info: {
          calls: o.calls,
          signal: o.signal,
          transport: o.transport ?? 'http',
          connectionParams: o.connectionParams,
        },
      });
    },
    publicError: (err) =>
      isUnexpectedError(err) && !expose
        ? new TrpcError({
            code: 'INTERNAL_SERVER_ERROR',
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
