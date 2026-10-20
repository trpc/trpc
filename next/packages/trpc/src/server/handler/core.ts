import {
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  FiberSet,
  ManagedRuntime,
  Predicate,
  Scope,
  Stream,
  type Layer,
  type Tracer,
} from 'effect';
import { HttpBody, HttpServerRequest, HttpServerResponse } from 'effect/http';
import {
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../../internal/error.ts';
import { CONTENT_TYPE } from '../../internal/protocol.ts';
import type { MaybePromise, ProcedureType } from '../../internal/types.ts';
import {
  callProcedure,
  isUnexpectedError,
  runtimeServices,
  unexpectedError,
} from '../execution/index.ts';
import type { CreateContextOpts, OnErrorOpts } from './fetch.ts';
import type { ResponseHandle, AnyProcedure } from '../procedures/index.ts';
import type { SocketDrains, Transport } from '../sockets/index.ts';

/** @internal */
export interface CoreOptions {
  createContext?: (opts: CreateContextOpts<any>) => MaybePromise<object>;
  /** Builds the services on first use; `dispose()` releases them. */
  layer?: Layer.Layer<any, any, never> | undefined;
  /** The caller's runtime: calls read its services, and it outlives the handler. */
  runtime?: ManagedRuntime.ManagedRuntime<never, unknown> | undefined;
  /** Services already built, the context of `makeFetchHandler`'s caller. */
  services?: Context.Context<any> | undefined;
  exposeUnexpectedErrors?: boolean;
  onError?: (opts: OnErrorOpts) => void;
  /** The handler's socket connections, which `dispose()` drains first. */
  drains?: SocketDrains | undefined;
  /**
   * How long `dispose()` waits for requests in flight.
   * @default '10 seconds'
   */
  drainTimeout?: Duration.Input | undefined;
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
  /**
   * Runs a connection's session with `context`, in the handler's
   * `FiberSet`, so `dispose()` interrupts it. Once `dispose()` has begun,
   * a session runs untracked: the drain refuses its connection (1012),
   * which the session does itself, and a closed set would interrupt it
   * before it could.
   */
  readonly fork: (
    session: Effect.Effect<void>,
    context?: Context.Context<never>,
  ) => void;
  /**
   * `app` as one of the handler's requests, its streamed body included:
   * `close` waits for it, up to the drain timeout, then interrupts it. An
   * event stream (SSE) never ends on its own, so `close` interrupts it
   * first, and its client reconnects. Once the handler has closed,
   * requests run untracked.
   */
  readonly request: <E, R>(
    app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>;
  /**
   * Ends what the handler started: interrupts its event streams, drains
   * the connections (`drains`) while it waits for the requests in flight,
   * then interrupts the sessions and requests still running and releases
   * the layer (not a caller's `runtime`). Later calls wait for the first.
   */
  readonly close: Effect.Effect<void>;
  /** `close`, as a Promise. */
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
  const owned = opts.layer ? ManagedRuntime.make(opts.layer) : undefined;
  /** The services, built once by the runtime on first use. */
  const services: Effect.Effect<Context.Context<any>> = opts.services
    ? Effect.succeed(opts.services)
    : runtimeServices(owned ?? opts.runtime);
  const drainTimeout = Duration.fromInputUnsafe(
    opts.drainTimeout ?? '10 seconds',
  );

  // Finalizers run last-added first: the fibers, then the layer.
  const scope = Scope.makeUnsafe();
  if (owned) Effect.runSync(Scope.addFinalizer(scope, owned.disposeEffect));
  const fibers = <A, E>() =>
    Effect.runSync(Scope.provide(FiberSet.make<A, E>(), scope));
  const sessions = fibers<void, never>();
  const requests = fibers<unknown, unknown>();
  const eventStreams = fibers<unknown, unknown>();
  let state: 'open' | 'closing' | 'closed' = 'open';
  const closed = Deferred.makeUnsafe<void>();

  /** Adds the running fiber to `set` until the handler has closed. */
  const join = (set: FiberSet.FiberSet<unknown, unknown>) =>
    Effect.withFiber((fiber) => {
      if (state !== 'closed') FiberSet.addUnsafe(set, fiber);
      return Effect.void;
    });
  const track = (response: HttpServerResponse.HttpServerResponse) => {
    const { body } = response;
    if (!Predicate.isTagged(body, 'Stream')) return response;
    const set = body.contentType.startsWith(CONTENT_TYPE.sse)
      ? eventStreams
      : requests;
    return HttpServerResponse.setBody(
      response,
      HttpBody.stream(
        Stream.unwrap(Effect.as(join(set), body.stream)),
        body.contentType,
        body.contentLength,
      ),
    );
  };

  const close = Effect.suspend(() => {
    if (state !== 'open') return Deferred.await(closed);
    state = 'closing';
    // A drained session writes its close frame on its next turn, so the
    // sessions get one before they're interrupted.
    return FiberSet.clear(eventStreams).pipe(
      Effect.andThen(
        Effect.all(
          [
            opts.drains?.drain({ final: true }) ?? Effect.void,
            Effect.timeoutOption(FiberSet.awaitEmpty(requests), drainTimeout),
          ],
          { concurrency: 'unbounded', discard: true },
        ),
      ),
      Effect.andThen(Effect.yieldNow),
      Effect.andThen(
        Effect.suspend(() => {
          state = 'closed';
          return Scope.close(scope, Exit.void);
        }),
      ),
      Effect.ensuring(Deferred.done(closed, Exit.void)),
      Effect.uninterruptible,
    );
  });

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
    fork: (session, context = Context.empty()) => {
      const fiber = Effect.runForkWith(context)(session);
      if (state === 'open') FiberSet.addUnsafe(sessions, fiber);
    },
    request: (app) => Effect.andThen(join(requests), Effect.map(app, track)),
    close,
    dispose: () => Effect.runPromise(close),
  };
}
