import { Cause, Effect, Option, Stream, Tracer } from 'effect';
import {
  isTrpcError,
  toBuiltinError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { OutputForm, ProcedureType } from '../internal/types.ts';
import type { AnySerializer } from '../serializer/index.ts';

/**
 * Call option fields the built-in links read from `op.context` (17 F-B).
 * Your own links declare theirs with `link<{ context: … }>()`.
 * @since 0.1.0
 * @stability stable
 */
export type BuiltinCallOptions = {
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
  /**
   * Called with each response this call gets, before its value goes up the
   * chain. A batched call gets its own line's status and the batch's
   * headers; a resumed stream or a reconnected subscription gets one per
   * response. An error it throws fails the call. A link that sets it calls
   * the one already in `op.context` too, so the caller's still runs. Read
   * by `httpLink`, which declares `provides: 'response'`.
   */
  onResponse?: ((meta: ResponseMeta) => void) | undefined;
};

/**
 * A response as `onResponse` sees it.
 * @since 0.1.0
 * @stability experimental
 */
export interface ResponseMeta {
  readonly status: number;
  readonly headers: Headers;
}

/**
 * `fetch` options `httpLink` lets calls set: `RequestInit` without what the
 * link sets itself, plus Next's data-cache options.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export interface Operation<TContext extends object = {}> {
  readonly id: number;
  readonly type: ProcedureType;
  /** `'post.byId'` */
  readonly path: string;
  readonly input: unknown;
  readonly context: BuiltinCallOptions & Partial<TContext>;
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
 * @since 0.1.0
 * @stability stable
 */
export type OperationStream = Stream.Stream<unknown, AnyTrpcError>;

/**
 * What an Effect link receives.
 * @since 0.1.0
 * @stability stable
 */
export interface EffectLinkOpts<TContext extends object = {}> {
  readonly op: Operation<TContext>;
  /** The rest of the chain. */
  readonly next: (op: Operation) => OperationStream;
}

/**
 * Call option names links can't declare: the client reads them itself.
 * @since 0.1.0
 * @stability stable
 */
export interface ReservedCallOptions {
  signal?: never;
  lastEventId?: never;
}

/**
 * What a link declares it reads (17 (c)). `context` fields are added to the
 * call options of clients created with `router:` (F-B), and arrive in
 * `op.context`. `signal` and `lastEventId` are reserved.
 * @since 0.1.0
 * @stability stable
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
  /**
   * The form results reach the caller in, for links that change it:
   * `openApiLink` receives plain JSON (`JsonForm`). The first link in the
   * array that declares one wins, so a link in front can restore types.
   */
  form?: OutputForm;
  /**
   * What the link offers the links before it, such as `'response'` for
   * `httpLink`'s `onResponse` reports.
   */
  provides?: string;
  /**
   * What the link needs a link after it to provide. `createTrpcClient`
   * rejects a `links` array where none does.
   */
  needs?: string;
}

/**
 * A link: one step of the client's request chain, a function from an
 * operation and the rest of the chain to the result stream. The last link
 * sends the request. `TDecl` is what it reads from `context`; `TRouter` is
 * set on router-aware links like a typed `splitLink`.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export type AnyLink = TrpcLink<any, any>;

/** The `context` a link's declaration adds. @internal */
export type DeclContext<TDecl> = TDecl extends { context: infer C }
  ? C extends object
    ? C
    : {}
  : {};

/**
 * Turns anything a link threw into a client error: a defined error, or a
 * built-in one with no `data`. An undeclared custom code is `CLIENT_ERROR`.
 * @internal
 */
export function toClientError(cause: unknown): AnyTrpcError {
  if (isTrpcError(cause)) return toBuiltinError(cause, 'CLIENT_ERROR');
  return new TrpcError({
    code: 'CLIENT_ERROR',
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

/**
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
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
 * Creates a link from a function returning an Effect `Stream` (17 L-A):
 * call `next(op)` for the rest of the chain and return its stream, or a
 * replacement. A query or mutation is a one-element stream. v11 links
 * convert with `fromV11Link` from `@trpc12/trpc/interop`.
 *
 * @example
 * ```ts
 * const authLink = link(({ op, next }) =>
 *   Stream.unwrap(
 *     Effect.map(getToken, (token) =>
 *       next({ ...op, context: { ...op.context, headers: { authorization: token } } }),
 *     ),
 *   ),
 * );
 * const timingLink = link(({ op, next }) =>
 *   next(op).pipe(Stream.tap(() => Effect.log(op.path))),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export const link = <TDecl extends LinkDecl = {}>(
  fn: (opts: EffectLinkOpts<DeclContext<TDecl>>) => OperationStream,
): TrpcLink<TDecl> => fn as TrpcLink<TDecl>;

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

/** `HttpTraceContext.toHeaders`, as a plain record. */
const traceHeaders = (span: Tracer.Span): Record<string, string> => {
  const sampled = span.sampled ? '1' : '0';
  const parent = Option.isSome(span.parent)
    ? `-${span.parent.value.spanId}`
    : '';
  return {
    b3: `${span.traceId}-${span.spanId}-${sampled}${parent}`,
    traceparent: `00-${span.traceId}-${span.spanId}-0${sampled}`,
  };
};

/**
 * Runs `op` through `links`; when a tracer is installed, in a `trpc.<path>`
 * client span, with the span's trace context on `op.trace`. Without one
 * there is no span and requests get no extra headers, so simple
 * cross-origin requests stay simple (no CORS preflight).
 * @since 0.1.0
 * @stability stable
 */
export function runOperation(
  links: ReadonlyArray<AnyLink>,
  op: Operation,
): OperationStream {
  // `Stream.withSpan`, from parts the client already ships.
  return Stream.unwrap(
    Effect.gen(function* () {
      const tracer = yield* Effect.tracer;
      if (tracer === Tracer.nativeTracer) return runLinks(links, op);
      const span = yield* Effect.makeSpanScoped(`trpc.${op.path}`, {
        kind: 'client',
        attributes: {
          'rpc.system': 'trpc',
          'rpc.method': op.path,
          'trpc.type': op.type,
        },
      });
      const disabled = yield* Tracer.DisablePropagation;
      const traced = disabled ? op : { ...op, trace: traceHeaders(span) };
      return runLinks(links, traced).pipe(
        Stream.tapError((err) =>
          Effect.sync(() => span.attribute('trpc.error.code', err.code)),
        ),
        Stream.provideService(Tracer.ParentSpan, span),
      );
    }),
  );
}

/**
 * Runs an operation through a link chain. It fails with the errors clients
 * type: defined ones, and built-in ones with no `data` ({@link toClientError}).
 * @since 0.1.0
 * @stability stable
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
  return Stream.catch(at(0)(op), (err) => Stream.fail(toClientError(err)));
}
