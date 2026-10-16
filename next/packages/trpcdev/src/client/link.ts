import { Cause, Effect, Option, Stream, Tracer } from 'effect';
import { HttpTraceContext } from 'effect/http';
import {
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { ProcedureType } from '../internal/types.ts';
import type { AnySerializer } from '../serializer/index.ts';

/**
 * Call option fields that links read from `op.context` (17 F-B). Built-in
 * links read `headers` and `reconnect`. Augment it to type your own links' fields:
 *
 * @example
 * ```ts
 * declare module 'trpcdev/client' {
 *   interface TrpcClientContext {
 *     transport?: 'http' | 'local';
 *   }
 * }
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcClientContext {
  /** Extra request headers, read by `httpLink`. */
  headers?: HeadersInit;
  /**
   * `fetch` options for this call, merged onto `httpLink`'s `init`. A call
   * whose `init` differs from the others' is batched apart from them.
   * Read by `httpLink`.
   */
  init?: TrpcRequestInit;
  /**
   * `false` sends this call alone, outside a batch. Read by `httpLink`. On
   * a batching link, procedures that may return a `Response` require it.
   */
  batch?: false;
  /**
   * `false` ends a subscription with `NETWORK_ERROR` when its connection
   * drops, instead of subscribing again. Read by `httpLink` and `wsLink`.
   */
  reconnect?: false;
}

/**
 * `fetch` options `httpLink` lets calls set: `RequestInit` without what the
 * link sets itself, plus Next's data-cache options.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcRequestInit = Omit<
  RequestInit,
  'body' | 'method' | 'signal'
> & {
  /** Next's `fetch` cache options, passed through as they are. */
  next?: { revalidate?: number | false; tags?: string[] } | undefined;
};

/**
 * One call, as links see it. `TContext` types the `context` fields a link
 * declares it reads.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface Operation<TContext extends object = {}> {
  readonly id: number;
  readonly type: ProcedureType;
  /** `'post.byId'` */
  readonly path: string;
  readonly input: unknown;
  readonly context: TrpcClientContext & Partial<TContext>;
  readonly signal: AbortSignal | undefined;
  /** Subscriptions: resume after this event id. */
  readonly lastEventId?: string | undefined;
  /**
   * The call span's trace context (`traceparent`, `b3`) for links to send.
   * Set only when a tracer is installed and propagation isn't disabled.
   */
  readonly trace?: Readonly<Record<string, string>> | undefined;
}

/**
 * The result of an operation (17 OR-A): a query or mutation is a
 * one-element stream, a subscription is a stream of events.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type OperationStream = Stream.Stream<unknown, AnyTrpcError>;

/**
 * What an Effect link receives.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface EffectLinkOpts<TContext extends object = {}> {
  readonly op: Operation<TContext>;
  /** The rest of the chain. */
  readonly next: (op: Operation) => OperationStream;
}

/**
 * What a Promise link receives. For a subscription, `next()` resolves to an
 * `AsyncIterable` of events.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface PromiseLinkOpts<TContext extends object = {}> {
  readonly op: Operation<TContext>;
  readonly next: (op: Operation) => Promise<unknown>;
}

/**
 * Call option names links can't declare: the client reads them itself.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface ReservedCallOptions {
  signal?: never;
  lastEventId?: never;
}

/**
 * What a link declares it reads (17 (c)). `context` fields are added to the
 * call options of clients created with `router:` (F-B), and arrive in
 * `op.context`. `signal` and `lastEventId` are reserved.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface LinkDecl {
  context?: object & ReservedCallOptions;
  /** The `switchLink` names in this link, so a name can't be used twice on one path. */
  switches?: string;
  /**
   * Errors the link itself fails calls with, such as a `TrpcError.Tagged`
   * class instance. They join every call's typed union (`defined: true`).
   */
  errors?: AnyTrpcError;
  /**
   * Operation types the link can't carry. The client has no method for
   * them: with `'subscription'`, procedures have no `.subscribe()`.
   */
  unsupported?: ProcedureType;
  /**
   * The link batches calls, so calls to procedures that may return a
   * `Response` must pass `{ batch: false }`.
   */
  batches?: true;
}

/**
 * A link: one step of the client's request chain, a function from an
 * operation and the rest of the chain to the result stream. The last link
 * sends the request. `TDecl` is what it reads from `context`; `TRouter` is
 * set on router-aware links like a typed `splitLink`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcLink<TDecl extends LinkDecl = {}, TRouter = any> {
  (opts: EffectLinkOpts): OperationStream;
  /**
   * Type-only. `decl` is invariant, so a link that declares nothing does not
   * absorb the declarations of the others in an array.
   */
  readonly '~types'?: {
    readonly decl: (decl: TDecl) => TDecl;
    readonly router: TRouter;
  };
}

/**
 * Any link, whatever it declares.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type AnyLink = TrpcLink<any, any>;

/** The `context` a link's declaration adds. @internal */
export type DeclContext<TDecl> = TDecl extends { context: infer C }
  ? C extends object
    ? C
    : {}
  : {};

/** Turns anything a link threw into a client error. @internal */
export function toClientError(cause: unknown): AnyTrpcError {
  if (isTrpcError(cause)) return cause;
  return new TrpcError({
    code: 'CLIENT_ERROR',
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

/**
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function clientErrorFromCause(
  cause: Cause.Cause<unknown>,
): AnyTrpcError {
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason)) return toClientError(reason.error);
  }
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason)) return toClientError(reason.defect);
  }
  return new TrpcError({
    code: 'CLIENT_CLOSED_REQUEST',
    message: 'The request was aborted',
  });
}

/**
 * The single value of a query or mutation.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const firstValue = (
  stream: OperationStream,
): Effect.Effect<unknown, AnyTrpcError> =>
  Stream.runHead(stream).pipe(
    Effect.flatMap((value) =>
      Option.isSome(value)
        ? Effect.succeed(value.value)
        : Effect.fail(
            new TrpcError({
              code: 'CLIENT_ERROR',
              message: 'The link chain ended without a result',
            }),
          ),
    ),
  );

/**
 * {@link link}: an async-function link, plus `link.effect` for Effect ones.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface LinkFactory {
  /**
   * Creates a link from an async function (17 L-B). Call `next(op)` to
   * continue the chain, and return its result (or a replacement).
   *
   * @example
   * ```ts
   * const authLink = link(async ({ op, next }) =>
   *   next({
   *     ...op,
   *     context: { ...op.context, headers: { authorization: await getToken() } },
   *   }),
   * );
   * ```
   */
  <TDecl extends LinkDecl = {}>(
    fn: (opts: PromiseLinkOpts<DeclContext<TDecl>>) => Promise<unknown>,
  ): TrpcLink<TDecl>;
  /**
   * Creates a link from a function returning an Effect `Stream` (17 L-B).
   *
   * @example
   * ```ts
   * const timingLink = link.effect(({ op, next }) =>
   *   next(op).pipe(Stream.tap(() => Effect.log(op.path))),
   * );
   * ```
   */
  effect: <TDecl extends LinkDecl = {}>(
    fn: (opts: EffectLinkOpts<DeclContext<TDecl>>) => OperationStream,
  ) => TrpcLink<TDecl>;
}

function promiseLink<TDecl extends LinkDecl = {}>(
  fn: (opts: PromiseLinkOpts<DeclContext<TDecl>>) => Promise<unknown>,
): TrpcLink<TDecl> {
  return ({ op, next }: EffectLinkOpts) => {
    const promiseNext = (o: Operation): Promise<unknown> =>
      o.type === 'subscription'
        ? Promise.resolve(Stream.toAsyncIterable(next(o)))
        : Effect.runPromise(firstValue(next(o)));
    const result = Effect.tryPromise({
      try: () =>
        fn({ op: op as Operation<DeclContext<TDecl>>, next: promiseNext }),
      catch: toClientError,
    });
    if (op.type !== 'subscription') return Stream.fromEffect(result);
    return Stream.unwrap(
      Effect.map(result, (events) =>
        Stream.fromAsyncIterable(
          events as AsyncIterable<unknown>,
          toClientError,
        ),
      ),
    );
  };
}

/**
 * Creates a link from an async function, or with `link.effect`, from a
 * function returning an Effect `Stream` (17 L-B).
 *
 * @example
 * ```ts
 * const authLink = link(async ({ op, next }) =>
 *   next({ ...op, context: { ...op.context, headers: { authorization: await getToken() } } }),
 * );
 * const timingLink = link.effect(({ op, next }) =>
 *   next(op).pipe(Stream.tap(() => Effect.log(op.path))),
 * );
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const link: LinkFactory = Object.assign(promiseLink, {
  effect: <TDecl extends LinkDecl = {}>(
    fn: (opts: EffectLinkOpts<DeclContext<TDecl>>) => OperationStream,
  ): TrpcLink<TDecl> => fn as TrpcLink<TDecl>,
});

const serializers = new WeakMap<AnyLink, AnySerializer>();

/** Records the serializer a link sends with. @internal */
export function withSerializer<L extends AnyLink>(
  target: L,
  serializer: AnySerializer | undefined,
): L {
  if (serializer) serializers.set(target, serializer);
  return target;
}

/** The first serializer a chain records, looking into split branches. @internal */
export function chainSerializer(
  links: ReadonlyArray<AnyLink>,
): AnySerializer | undefined {
  for (const current of links) {
    const found = serializers.get(current);
    if (found) return found;
  }
  return undefined;
}

const switchNames = new WeakMap<AnyLink, ReadonlySet<string>>();

/** Records the `switchLink` names a link contains. @internal */
export function setSwitchNames(target: AnyLink, names: Iterable<string>): void {
  switchNames.set(target, new Set(names));
}

/**
 * The `switchLink` names in a chain. Throws when two links on the chain
 * use the same one, since one call option would force both. @internal
 */
export function chainSwitchNames(links: ReadonlyArray<AnyLink>): Set<string> {
  const names = new Set<string>();
  for (const current of links) {
    for (const name of switchNames.get(current) ?? []) {
      if (names.has(name)) {
        throw new TypeError(`Two switchLinks on one chain are named "${name}"`);
      }
      names.add(name);
    }
  }
  return names;
}

/**
 * Runs `op` through `links` in a `trpc.<path>` client span, with the span's
 * trace context on `op.trace` when a tracer is installed. Without one,
 * requests get no extra headers, so simple cross-origin requests stay
 * simple (no CORS preflight).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function runOperation(
  links: ReadonlyArray<AnyLink>,
  op: Operation,
): OperationStream {
  return Stream.unwrap(
    Effect.gen(function* () {
      const tracer = yield* Effect.tracer;
      const disabled = yield* Tracer.DisablePropagation;
      const span = yield* Effect.option(Effect.currentSpan);
      if (tracer === Tracer.nativeTracer || disabled || Option.isNone(span)) {
        return runLinks(links, op);
      }
      const trace = Object.fromEntries(
        Object.entries(HttpTraceContext.toHeaders(span.value)),
      ) as Record<string, string>;
      return runLinks(links, { ...op, trace });
    }),
  ).pipe(
    Stream.tapError((err) =>
      Effect.annotateCurrentSpan('trpc.error.code', err.code),
    ),
    Stream.withSpan(`trpc.${op.path}`, {
      kind: 'client',
      attributes: {
        'rpc.system': 'trpc',
        'rpc.method': op.path,
        'trpc.type': op.type,
      },
    }),
  );
}

/**
 * Runs an operation through a link chain.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function runLinks(
  links: ReadonlyArray<AnyLink>,
  op: Operation,
): OperationStream {
  const at =
    (i: number) =>
    (o: Operation): OperationStream => {
      const current = links[i];
      if (!current) {
        return Stream.fail(
          new TrpcError({
            code: 'CLIENT_ERROR',
            message: 'The last link must send the request (e.g. httpLink)',
          }),
        );
      }
      return Stream.suspend(() => current({ op: o, next: at(i + 1) }));
    };
  return at(0)(op);
}
