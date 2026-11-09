import { Cause, Duration, Effect, Exit, Queue, Scope, Stream } from 'effect';
import {
  fromWireError,
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../../../internal/error.ts';
import {
  CONTENT_TYPE,
  HEADER,
  SSE_EVENT,
  sseEvents,
  type SseEvent,
} from '../../../internal/protocol.ts';
import type { Operation, OperationStream } from '../../link.ts';
import {
  badResponse,
  makeDeferredDecoder,
  type DeferredDecoder,
} from '../events.ts';
import type { HttpLinkOptions } from './link.ts';
import { ok, type Transport } from './transport.ts';

/**
 * Subscriptions over SSE: one stream at a time, reconnecting with
 * `Last-Event-ID` after a dropped one until `reconnect.attempts` in a row
 * fail.
 *
 * A server's `reconnect` event moves the subscription make-before-break:
 * a new stream opens from the last event id while the old one keeps
 * delivering, and the old one is left once the new one sends anything
 * (`connected` first). The new one resends what the old one delivered
 * meanwhile, and each such event is dropped once by its id. A
 * subscription with no event id to resume from can't be resent what the
 * old stream delivered before the new one listened, so the old one keeps
 * delivering until it ends, and events may arrive twice. A new stream
 * that fails leaves the old
 * one delivering and is tried again with `reconnect.delay`, for as long
 * as the old one lasts. At the notice's `drainIn`, when the server
 * closes the old stream, the link leaves it if it's still open.
 */
export function makeSubscriptions(
  transport: Transport,
  opts: HttpLinkOptions,
): (op: Operation) => OperationStream {
  const reconnectAttempts = opts.reconnect?.attempts ?? 5;
  const reconnectDelay =
    opts.reconnect?.delay ??
    ((attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 30_000));

  return (op) =>
    Stream.callback<Effect.Effect<unknown, AnyTrpcError>, AnyTrpcError>(
      (queue) => {
        let lastEventId = op.lastEventId;
        let attempt = 0;
        const moves = op.context.reconnect !== false;
        const giveUp = () => !moves || ++attempt > reconnectAttempts;

        const read = (
          event: SseEvent,
          decoder: DeferredDecoder,
        ): Effect.Effect<boolean, unknown> => {
          switch (event.event) {
            case SSE_EVENT.done:
              return Effect.succeed(true);
            case SSE_EVENT.error:
              return Effect.try({
                try: () =>
                  fromWireError(
                    transport.transformer.deserialize(JSON.parse(event.data)),
                  ),
                catch: (cause) => cause,
              }).pipe(Effect.flatMap(Effect.fail));
            case SSE_EVENT.chunk:
              return Effect.try({
                try: () =>
                  JSON.parse(event.data) as { e: number; chunk?: unknown },
                catch: (cause) => cause,
              }).pipe(
                Effect.flatMap((frame) =>
                  'chunk' in frame
                    ? decoder.chunk(frame.e, frame.chunk)
                    : decoder.end(frame.e),
                ),
                Effect.as(false),
              );
            case SSE_EVENT.message:
            case SSE_EVENT.deferred: {
              if (event.id !== undefined) lastEventId = event.id;
              attempt = 0;
              return Effect.try({
                try: () => JSON.parse(event.data) as unknown,
                catch: (cause) => cause,
              }).pipe(
                Effect.flatMap((data) =>
                  event.event === SSE_EVENT.deferred
                    ? decoder.decode(
                        (data as { body: unknown }).body,
                        (data as { e: number }).e,
                      )
                    : decoder.decode(data, undefined),
                ),
                Effect.map((value) => {
                  Queue.offerUnsafe(
                    queue,
                    Effect.mapError(value, badResponse('Invalid event')),
                  );
                  return false;
                }),
              );
            }
            default:
              return Effect.succeed(false);
          }
        };

        return Effect.gen(function* () {
          const parent = yield* Effect.scope;
          const inbox = yield* Queue.unbounded<Signal>();

          /**
           * Opens a stream after `delay`, into `inbox`. Closing its scope
           * aborts the request.
           */
          const open = (delay: Duration.Input | undefined) =>
            Effect.gen(function* () {
              const scope = yield* Scope.fork(parent);
              const decoder = makeDeferredDecoder(transport.transformer);
              yield* Scope.addFinalizer(scope, decoder.close);
              const leg: Leg = {
                scope,
                decoder,
                resumes: Boolean(lastEventId),
              };
              const lost = (signal: Omit<Lost, 'leg'>) =>
                Queue.offer(inbox, { leg, ...signal });
              yield* Effect.gen(function* () {
                if (delay !== undefined) yield* Effect.sleep(delay);
                const reply = yield* transport
                  .call(
                    op,
                    CONTENT_TYPE.sse,
                    lastEventId ? { [HEADER.lastEventId]: lastEventId } : {},
                  )
                  .pipe(
                    Effect.catch((error) =>
                      Effect.as(lost({ error, fatal: undefined }), null),
                    ),
                  );
                if (!reply) return;
                yield* transport.reported(op, reply);
                if (!ok(reply) || reply.web.body === null) {
                  return yield* transport.readError(reply);
                }
                yield* sseEvents(reply.response.stream).pipe(
                  Stream.runForEach((event) =>
                    Queue.offer(inbox, { leg, event }),
                  ),
                  Effect.ignore,
                );
                yield* lost({ error: undefined, fatal: undefined });
              }).pipe(
                Effect.catch((fatal) => lost({ error: fatal, fatal })),
                Scope.provide(scope),
                Effect.forkIn(scope),
              );
              return leg;
            });

          let active = yield* open(undefined);
          /** The new stream, until its first event. */
          let pending: Leg | undefined;
          /** The stream a server asked to leave, while it still delivers. */
          let leaving: Leg | undefined;
          /** Streams an untracked move left, which deliver until they end. */
          const kept = new Set<Leg>();
          let failures = 0;
          /**
           * The ids `active` delivered since `pending` opened, which the
           * new stream resends.
           */
          let overlap = new Set<string>();
          const end = (leg: Leg) => Scope.close(leg.scope, Exit.void);
          /** Whether the stream `active` became resends `event`. */
          const resent = (event: SseEvent) => {
            if (event.id === undefined || overlap.size === 0) return false;
            if (!overlap.delete(event.id)) {
              overlap.clear();
              return false;
            }
            return true;
          };

          for (;;) {
            const signal = yield* Queue.take(inbox);
            if ('retry' in signal) {
              // Stale once `active` is gone.
              if (signal.retry === active) pending = yield* open(undefined);
              continue;
            }
            const { leg } = signal;
            if (kept.has(leg)) {
              const handled =
                'event' in signal
                  ? yield* Effect.exit(read(signal.event, leg.decoder))
                  : Exit.succeed(true);
              if (Exit.isFailure(handled) || handled.value) {
                kept.delete(leg);
                yield* end(leg);
              }
              continue;
            }
            if (leg === pending) {
              pending = undefined;
              if (!('event' in signal)) {
                yield* end(leg);
                const from = active;
                yield* Queue.offer(inbox, { retry: from }).pipe(
                  Effect.delay(reconnectDelay(++failures)),
                  Effect.forkIn(parent),
                );
                continue;
              }
              if (leg.resumes) yield* end(active);
              else kept.add(active);
              active = leg;
              leaving = undefined;
              failures = 0;
            } else if (leg !== active) {
              continue;
            }
            if ('event' in signal) {
              const { event } = signal;
              if (event.event === SSE_EVENT.reconnect) {
                if (moves && !leaving) {
                  leaving = active;
                  overlap = new Set();
                  const drainIn = drainInOf(event.data);
                  // Lost at the server's deadline, unless it's gone first.
                  if (drainIn !== undefined) {
                    yield* Queue.offer(inbox, {
                      leg: active,
                      error: undefined,
                      fatal: undefined,
                    }).pipe(
                      Effect.delay(Duration.millis(drainIn)),
                      Effect.forkIn(active.scope),
                    );
                  }
                  pending = yield* open(undefined);
                }
                continue;
              }
              if (!pending && resent(event)) continue;
              if (pending && event.id !== undefined) overlap.add(event.id);
              const handled = yield* Effect.exit(read(event, active.decoder));
              if (Exit.isSuccess(handled)) {
                if (handled.value) return;
                continue;
              }
              const cause = Cause.squash(handled.cause);
              if (isTrpcError(cause)) return yield* Effect.fail(cause);
            } else if (signal.fatal) {
              return yield* Effect.fail(signal.fatal);
            }
            // `active` is gone.
            yield* end(active);
            if (pending) {
              // The new stream resends from before what the old one delivered.
              active = pending;
              pending = undefined;
              leaving = undefined;
              continue;
            }
            leaving = undefined;
            if (giveUp()) {
              return yield* Effect.fail(
                'event' in signal || signal.error === undefined
                  ? new TrpcError({
                      code: 'NETWORK_ERROR',
                      message: 'The subscription connection was lost',
                    })
                  : (signal.error as AnyTrpcError),
              );
            }
            active = yield* open(reconnectDelay(attempt));
          }
        }).pipe(
          Effect.scoped,
          Effect.matchCause({
            onSuccess: () => Queue.endUnsafe(queue),
            onFailure: (cause) => Queue.failCauseUnsafe(queue, cause),
          }),
          Effect.forkScoped,
        );
      },
    ).pipe(Stream.mapEffect((value) => value));
}

/** One SSE stream of a subscription. */
/** A `reconnect` event's `drainIn`, in milliseconds, if it gives one. */
const drainInOf = (data: string): number | undefined => {
  let drainIn: unknown;
  try {
    drainIn = (JSON.parse(data) as { drainIn?: unknown }).drainIn;
  } catch {
    return undefined;
  }
  return typeof drainIn === 'number' ? drainIn : undefined;
};

interface Leg {
  readonly scope: Scope.Closeable;
  readonly decoder: DeferredDecoder;
  /** Opened with `Last-Event-ID`: the server resends what came after it. */
  readonly resumes: boolean;
}

/**
 * A stream ended: `error` is what its request failed with, if it did, and
 * `fatal` a server's error response, which ends the subscription.
 */
interface Lost {
  readonly leg: Leg;
  readonly error: AnyTrpcError | undefined;
  readonly fatal: AnyTrpcError | undefined;
}

type Signal =
  | { readonly leg: Leg; readonly event: SseEvent }
  | Lost
  /** Try again to open a stream for `retry`, which a server asked to leave. */
  | { readonly retry: Leg };
