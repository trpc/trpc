import { Context, Effect, ManagedRuntime, type Exit, type Layer } from 'effect';
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
}

/** @internal */
export interface MakeContextOpts {
  request: Request;
  calls: ReadonlyArray<{ path: string; type: ProcedureType }>;
  signal?: AbortSignal;
  transport?: Transport;
  connectionParams?: Record<string, unknown> | undefined;
}

/** What every handler shares: ctx, services, masking and `onError`. @internal */
export interface HandlerCore {
  readonly run: (opts: RunOpts) => Promise<Exit.Exit<unknown, AnyTrpcError>>;
  readonly makeContext: (opts: MakeContextOpts) => Promise<object>;
  /** Records the platform value `createContext` gets for `request`. */
  readonly setPlatform: (request: Request, platform: unknown) => void;
  /** Masks unexpected errors unless `exposeUnexpectedErrors`. */
  readonly publicError: (err: AnyTrpcError) => AnyTrpcError;
  readonly report: (
    err: AnyTrpcError,
    request: Request,
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
  const getServices = () =>
    (services ??= runtime
      ? runtime.context()
      : Promise.resolve(Context.empty() as Context.Context<any>));

  const platforms = new WeakMap<Request, unknown>();
  return {
    run: async (o) => {
      const base = await getServices();
      const context = o.services ? Context.merge(base, o.services) : base;
      return Effect.runPromiseExitWith(context)(callProcedure(o), {
        signal: o.signal,
      });
    },
    makeContext: async (o) => {
      if (!opts.createContext) return {};
      return await opts.createContext({
        request: o.request,
        platform: platforms.get(o.request),
        info: {
          calls: o.calls,
          signal: o.signal ?? o.request.signal,
          transport: o.transport ?? 'http',
          connectionParams: o.connectionParams,
        },
      });
    },
    setPlatform: (request, platform) => {
      if (platform !== undefined) platforms.set(request, platform);
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
