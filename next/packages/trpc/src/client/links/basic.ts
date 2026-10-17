import { Effect, Exit, Stream } from 'effect';
import { serverFailure, type AnyTrpcError } from '../../internal/error.ts';
import { HEADER } from '../../internal/protocol.ts';
import type { IsAny, ProcedureType } from '../../internal/types.ts';
import { danson } from '../../serializer/danson.ts';
import {
  firstValue,
  link,
  runLinks,
  type AnyLink,
  type Operation,
  type OperationStream,
  type TrpcLink,
  chainSerializer,
  chainSwitchNames,
  setSwitchNames,
  withSerializer,
} from '../link.ts';
import type { RouterPaths } from '../types.ts';
import { withResume, type Resume } from './resume.ts';

/** @internal */
export type Chain = AnyLink | ReadonlyArray<AnyLink>;

/** @internal */
export const asArray = (links: Chain): ReadonlyArray<AnyLink> =>
  Array.isArray(links) ? (links as ReadonlyArray<AnyLink>) : [links as AnyLink];

/** @internal */
export type ChainDecl<T> =
  T extends ReadonlyArray<infer L>
    ? L extends TrpcLink<infer D, any>
      ? Declared<D>
      : never
    : T extends TrpcLink<infer D, any>
      ? Declared<D>
      : never;

/** An untyped link declares nothing. */
type Declared<D> = IsAny<D> extends true ? {} : D;

type ChainUnsupported<T> =
  ChainDecl<T> extends infer D
    ? D extends { unsupported: infer U }
      ? U
      : never
    : never;

type ChainProvides<T> =
  ChainDecl<T> extends infer D
    ? D extends { provides: infer P extends string }
      ? P
      : never
    : never;

type OmitBranchOnly<D> = D extends unknown
  ? Omit<D, 'unsupported' | 'provides' | 'needs'>
  : never;

type Intersect<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

type CommonUnsupported<TBranches extends Record<string, Chain>> =
  Intersect<
    {
      [K in keyof TBranches]: { u: ChainUnsupported<TBranches[K]> };
    }[keyof TBranches]
  > extends { u: infer U extends ProcedureType }
    ? U
    : never;

type CommonProvides<TBranches extends Record<string, Chain>> =
  Intersect<
    {
      [K in keyof TBranches]: { p: ChainProvides<TBranches[K]> };
    }[keyof TBranches]
  > extends { p: infer P extends string }
    ? P
    : never;

/**
 * What a link that routes to one of several chains declares: what its
 * chains declare, except that it can't carry only what none of them can,
 * and provides only what all of them do.
 * @internal
 */
export type BranchesDecl<TBranches extends Record<string, Chain>> =
  | OmitBranchOnly<ChainDecl<TBranches[keyof TBranches]>>
  | ([CommonUnsupported<TBranches>] extends [never]
      ? never
      : { unsupported: CommonUnsupported<TBranches> })
  | ([CommonProvides<TBranches>] extends [never]
      ? never
      : { provides: CommonProvides<TBranches> });

/**
 * Options for {@link splitLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface SplitLinkOptions<
  TRouter = any,
  TTrue extends Chain = Chain,
  TFalse extends Chain = Chain,
> {
  /** With `router:` on the client, `op.path` is the router's paths. */
  condition: (
    op: Operation & { readonly path: RouterPaths<TRouter> },
  ) => boolean;
  /** The chain for operations where `condition` is true. */
  true: TTrue;
  /** The chain for the rest. */
  false: TFalse;
}

/**
 * Routes each operation to one of two chains. Declares what both chains
 * declare.
 *
 * @example
 * ```ts
 * splitLink({
 *   condition: (op) => op.type === 'subscription',
 *   true: wsLink({ url }),
 *   false: httpLink({ url, batch: true }),
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function splitLink<
  TRouter = any,
  TTrue extends Chain = Chain,
  TFalse extends Chain = Chain,
>(
  opts: SplitLinkOptions<TRouter, TTrue, TFalse>,
): TrpcLink<BranchesDecl<{ true: TTrue; false: TFalse }>, TRouter> {
  const yes = asArray(opts.true);
  const no = asArray(opts.false);
  const split = link((args) =>
    runLinks(opts.condition(args.op as never) ? yes : no, args.op),
  );
  setSwitchNames(split, [...chainSwitchNames(yes), ...chainSwitchNames(no)]);
  withSerializer(split, chainSerializer([...yes, ...no]));
  return split as TrpcLink<any, TRouter>;
}

/**
 * Options for {@link dedupeLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface DedupeLinkOptions {
  /**
   * The key identical queries share.
   * @default the path and the serialized input
   */
  key?: (op: Operation) => string;
}

/**
 * What {@link dedupeLink} reads from `context`.
 * @since 0.1.0
 * @stability stable
 */
export interface DedupeContext {
  /** `false` sends this query on its own. */
  dedupe?: boolean;
}

/** One deduped request and the callers still waiting on it. */
interface InFlight {
  promise: Promise<Exit.Exit<unknown, AnyTrpcError>>;
  controller: AbortController;
  refs: number;
}

/**
 * Shares one request between identical queries in flight at the same time.
 * Every caller gets the same result value, so a deferred `AsyncIterable`
 * in it is shared too: send such queries with `{ dedupe: false }`.
 * The request is aborted only when every caller has aborted.
 *
 * @example
 * ```ts
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [dedupeLink(), httpLink({ url })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function dedupeLink(
  opts: DedupeLinkOptions = {},
): TrpcLink<{ context: DedupeContext }> {
  const keyOf =
    opts.key ??
    ((op: Operation) =>
      `${op.path}\n${op.input === undefined ? '' : JSON.stringify(danson.serialize(op.input))}`);
  const inFlight = new Map<string, InFlight>();
  return link<{ context: DedupeContext }>((args) => {
    const { op } = args;
    if (op.type !== 'query' || op.context.dedupe === false)
      return args.next(op);
    const key = keyOf(op);
    return Stream.fromEffect(
      Effect.callback<unknown, AnyTrpcError>((resume) => {
        let entry = inFlight.get(key);
        if (!entry) {
          const controller = new AbortController();
          const created: InFlight = {
            controller,
            refs: 0,
            promise: Effect.runPromiseExit(
              firstValue(args.next({ ...op, signal: controller.signal })),
              { signal: controller.signal },
            ).finally(() => {
              if (inFlight.get(key) === created) inFlight.delete(key);
            }),
          };
          entry = created;
          inFlight.set(key, entry);
        }
        const shared = entry;
        shared.refs++;
        let settled = false;
        void shared.promise.then((exit) => {
          settled = true;
          resume(exit);
        });
        return Effect.sync(() => {
          if (settled) return;
          if (--shared.refs === 0) {
            if (inFlight.get(key) === shared) inFlight.delete(key);
            shared.controller.abort();
          }
        });
      }),
    );
  });
}

/**
 * A log entry from {@link loggerLink}.
 * @since 0.1.0
 * @stability stable
 */
export type LoggerEvent =
  | { direction: 'up'; op: Operation }
  | { direction: 'down'; op: Operation; result: unknown; elapsedMs: number }
  | {
      direction: 'error';
      op: Operation;
      error: AnyTrpcError;
      elapsedMs: number;
    };

/**
 * Logs every operation, its results and its errors.
 *
 * @example
 * ```ts
 * loggerLink({ enabled: () => import.meta.env.DEV });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function loggerLink(
  opts: {
    enabled?: (op: Operation) => boolean;
    log?: (event: LoggerEvent) => void;
  } = {},
): TrpcLink {
  const log =
    opts.log ??
    ((event: LoggerEvent) => {
      const { op } = event;
      const label = `${event.direction === 'up' ? '>>' : '<<'} ${op.type} #${op.id} ${op.path}`;
      if (event.direction === 'error') console.error(label, event.error);
      else
        console.log(label, event.direction === 'up' ? op.input : event.result);
    });
  return link((args) => {
    const { op } = args;
    if (opts.enabled && !opts.enabled(op)) return args.next(op);
    const start = Date.now();
    log({ direction: 'up', op });
    return args.next(op).pipe(
      Stream.tap((result) =>
        Effect.sync(() =>
          log({ direction: 'down', op, result, elapsedMs: Date.now() - start }),
        ),
      ),
      Stream.tapError((error) =>
        Effect.sync(() =>
          log({ direction: 'error', op, error, elapsedMs: Date.now() - start }),
        ),
      ),
    );
  });
}

/**
 * Options for {@link retryLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface RetryLinkOptions {
  /** @default 3 */
  retries?: number;
  /**
   * Delay before each retry, given the error it retries (a `RateLimited`
   * error's `data.retryAfter`, for one). @default attempt => 2 ** attempt * 100
   */
  delayMs?: (attempt: number, error: AnyTrpcError) => number;
  /**
   * Whether to retry. By default: queries only, and only errors outside the
   * typed union (network failures, 5xx), never aborts.
   */
  retry?: (opts: {
    op: Operation;
    error: AnyTrpcError;
    attempt: number;
  }) => boolean;
}

const defaultRetry: NonNullable<RetryLinkOptions['retry']> = (opts) =>
  opts.op.type === 'query' &&
  !opts.error.defined &&
  opts.error.code !== 'CLIENT_CLOSED_REQUEST' &&
  serverFailure(opts.error);

/**
 * Retries failed operations.
 *
 * @example
 * ```ts
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [retryLink({ retries: 3 }), httpLink({ url })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function retryLink(opts: RetryLinkOptions = {}): TrpcLink {
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? ((attempt: number) => 2 ** attempt * 100);
  const shouldRetry = opts.retry ?? defaultRetry;
  return link((args) => {
    const attempt = (n: number): OperationStream =>
      Stream.catch(args.next(args.op), (error) =>
        n < retries && shouldRetry({ op: args.op, error, attempt: n + 1 })
          ? Stream.unwrap(
              Effect.sleep(delayMs(n + 1, error)).pipe(
                Effect.as(attempt(n + 1)),
              ),
            )
          : Stream.fail(error),
      );
    return attempt(0);
  });
}

/**
 * Call options {@link experimental_durableLink} reads.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableContext {
  /**
   * The call's id, for a call that should pick up a result kept from
   * before a reload (store it in `sessionStorage`). A new one per call by
   * default.
   */
  callId?: string;
  /** `false` sends this call as usual; `true` makes a query durable. */
  durable?: boolean;
}

/**
 * Options for {@link experimental_durableLink}.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableLinkOptions {
  /** Retries after a lost response, with the same call id. @default 3 */
  retries?: number;
  /** @default attempt => 2 ** attempt * 100 */
  delayMs?: (attempt: number, error: AnyTrpcError) => number;
}

const lostResponse = (error: AnyTrpcError) =>
  !error.defined &&
  error.code !== 'CLIENT_CLOSED_REQUEST' &&
  serverFailure(error);

/**
 * Gives mutations (and queries with `{ durable: true }`) a call id, sent as
 * the `trpc-call-id` header outside any batch, and retries a lost response
 * with the same id, so a procedure using `experimental_durable()` returns the kept
 * result instead of running again. When a streamed output's connection
 * drops, `httpLink` asks for the frames after the ones it got
 * (`trpc-resume-from`) and the open deferred values settle from those. Put
 * it before `httpLink`.
 *
 * @example
 * ```ts
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [experimental_durableLink(), httpLink({ url, batch: true })],
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_durableLink(
  opts: DurableLinkOptions = {},
): TrpcLink<{ context: DurableContext }> {
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? ((attempt: number) => 2 ** attempt * 100);
  return link<{ context: DurableContext }>((args) => {
    const { op } = args;
    if (
      op.type === 'subscription' ||
      !(op.context.durable ?? op.type === 'mutation')
    )
      return args.next(op);
    const callId = op.context.callId ?? crypto.randomUUID();
    const headers = new Headers(op.context.headers);
    headers.set(HEADER.callId, callId);
    const resume: Resume = { retries, delayMs, lost: lostResponse };
    const sent: Operation = {
      ...op,
      context: withResume({ ...op.context, headers, batch: false }, resume),
    };
    const attempt = (n: number): OperationStream =>
      Stream.catch(args.next(sent), (error) =>
        n < retries && lostResponse(error)
          ? Stream.unwrap(
              Effect.sleep(delayMs(n + 1, error)).pipe(
                Effect.as(attempt(n + 1)),
              ),
            )
          : Stream.fail(error),
      );
    return attempt(0);
  });
}
