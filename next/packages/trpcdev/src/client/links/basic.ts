import { Effect, Exit, Stream } from 'effect';
import type { AnyTrpcError } from '../../internal/error.ts';
import { defaultSerializer } from '../../serializer/index.ts';
import {
  firstValue,
  link,
  runLinks,
  type AnyLink,
  type Operation,
  type OperationStream,
  type TrpcLink,
} from '../link.ts';
import type { RouterPaths } from '../types.ts';

type Chain = AnyLink | ReadonlyArray<AnyLink>;

const asArray = (links: Chain) =>
  Array.isArray(links) ? (links as ReadonlyArray<AnyLink>) : [links as AnyLink];

type ChainDecl<T> =
  T extends ReadonlyArray<infer L>
    ? L extends TrpcLink<infer D, any>
      ? D
      : never
    : T extends TrpcLink<infer D, any>
      ? D
      : never;

/**
 * Options for {@link splitLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function splitLink<
  TRouter = any,
  TTrue extends Chain = Chain,
  TFalse extends Chain = Chain,
>(
  opts: SplitLinkOptions<TRouter, TTrue, TFalse>,
): TrpcLink<ChainDecl<TTrue> | ChainDecl<TFalse>, TRouter> {
  const yes = asArray(opts.true);
  const no = asArray(opts.false);
  return link.effect(({ op }) =>
    runLinks(opts.condition(op as never) ? yes : no, op),
  ) as TrpcLink<any, TRouter>;
}

/**
 * Options for {@link dedupeLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface DedupeContext {
  /** `false` sends this query on its own. */
  dedupe?: boolean;
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function dedupeLink(
  opts: DedupeLinkOptions = {},
): TrpcLink<{ context: DedupeContext }> {
  const keyOf =
    opts.key ??
    ((op: Operation) =>
      `${op.path}\n${op.input === undefined ? '' : JSON.stringify(defaultSerializer.serialize(op.input))}`);
  const inFlight = new Map<
    string,
    {
      promise: Promise<Exit.Exit<unknown, AnyTrpcError>>;
      controller: AbortController;
      refs: number;
    }
  >();
  return link.effect<{ context: DedupeContext }>(({ op, next }) => {
    if (op.type !== 'query' || op.context.dedupe === false) return next(op);
    const key = keyOf(op);
    return Stream.fromEffect(
      Effect.callback<unknown, AnyTrpcError>((resume) => {
        let entry = inFlight.get(key);
        if (!entry) {
          const controller = new AbortController();
          const created = {
            controller,
            refs: 0,
            promise: Effect.runPromiseExit(
              firstValue(next({ ...op, signal: controller.signal })),
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
  return link.effect(({ op, next }) => {
    if (opts.enabled && !opts.enabled(op)) return next(op);
    const start = Date.now();
    log({ direction: 'up', op });
    return next(op).pipe(
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface RetryLinkOptions {
  /** @default 3 */
  retries?: number;
  /** Delay before each retry. @default attempt => 2 ** attempt * 100 */
  delayMs?: (attempt: number) => number;
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

const defaultRetry: NonNullable<RetryLinkOptions['retry']> = ({ op, error }) =>
  op.type === 'query' &&
  !error.defined &&
  error.code !== 'CLIENT_CLOSED_REQUEST' &&
  (error.status === 0 || error.status >= 500);

/**
 * Retries failed operations.
 *
 * @example
 * ```ts
 * createTrpcClient<AppRouter>({
 *   links: [retryLink({ retries: 3 }), httpLink({ url })],
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function retryLink(opts: RetryLinkOptions = {}): TrpcLink {
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? ((attempt: number) => 2 ** attempt * 100);
  const shouldRetry = opts.retry ?? defaultRetry;
  return link.effect(({ op, next }) => {
    const attempt = (n: number): OperationStream =>
      Stream.catch(next(op), (error) =>
        n < retries && shouldRetry({ op, error, attempt: n + 1 })
          ? Stream.unwrap(
              Effect.sleep(delayMs(n + 1)).pipe(Effect.as(attempt(n + 1))),
            )
          : Stream.fail(error),
      );
    return attempt(0);
  });
}
