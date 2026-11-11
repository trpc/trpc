import type { TRPCError } from '../../@trpc/server';
// oxlint-disable-next-line no-restricted-imports
import type {
  MachineTransition,
  StateMachine,
} from '../../unstable-core-do-not-import';
// oxlint-disable-next-line no-restricted-imports
import { exhaustive } from '../../unstable-core-do-not-import';

/*
 * One subscription, from its setup to its last reply. Each step ends with at
 * most one effect that waits for the world (`setUp`, `send`, `open`, `next`
 * or `close`), and that effect's outcome is the next event, so a
 * subscription only ever waits for one thing. A stop isn't an event: it
 * aborts the subscription's signal, and `setUp` and `next` end with it.
 *
 * The iterator and its values aren't in the state. The interpreter holds
 * them, so the machine can be modelled without them, and so that no state
 * keeps a value alive.
 */

/** How a started subscription ended. */
export type SubscriptionEnd =
  | { kind: 'completed' }
  | { kind: 'stopped' }
  | { kind: 'failed'; error: TRPCError };

/**
 * What happens once a final reply is sent, or fails to be: nothing more, or
 * `stopped`, after reporting a failed cleanup.
 */
export type AfterReply =
  | { then: 'end' }
  | { then: 'stopped'; cleanupError: TRPCError | null };

export type SubscriptionState =
  /** Waiting for the context and the procedure's iterable. */
  | { status: 'settingUp' }
  | { status: 'sendingStarted' }
  /**
   * Opening the iterator. It's opened even when `started` couldn't be sent,
   * so that its cleanup runs.
   */
  | { status: 'opening'; startedError: TRPCError | null }
  /** Waiting for the iterator's next value. */
  | { status: 'pulling' }
  | { status: 'sendingValue' }
  /** Disposing the iterator, which can throw. */
  | { status: 'closing'; end: SubscriptionEnd }
  /** Sending the error that ended the subscription. */
  | { status: 'sendingError'; error: TRPCError; after: AfterReply }
  /** The error couldn't be sent, so the client gets its fallback shape. */
  | { status: 'sendingFallback'; after: AfterReply }
  | { status: 'sendingStopped' }
  | { status: 'ended' };

export type SubscriptionEvent =
  | { type: 'setUp' }
  | { type: 'setUpCancelled' }
  | { type: 'setUpFailed'; error: TRPCError }
  | { type: 'sent' }
  | { type: 'sendFailed'; error: TRPCError }
  | { type: 'opened' }
  | { type: 'openFailed'; error: TRPCError }
  | { type: 'value' }
  | { type: 'completed' }
  | { type: 'stopped' }
  | { type: 'nextFailed'; error: TRPCError }
  | { type: 'closed' }
  | { type: 'closeFailed'; error: TRPCError };

export type SubscriptionReply =
  | { kind: 'started' }
  | { kind: 'value' }
  | { kind: 'error'; error: TRPCError }
  /** The fallback shape of `error`, which says nothing beyond its code. */
  | { kind: 'fallback'; error: TRPCError }
  | { kind: 'stopped' };

export type SubscriptionEffect =
  | { type: 'setUp' }
  | { type: 'send'; reply: SubscriptionReply }
  | { type: 'open' }
  | { type: 'next' }
  | { type: 'close' }
  /** Aborts the subscription's signal. */
  | { type: 'abort' }
  /**
   * Tells `onError`. An internal error is one of the adapter's own, such as
   * a reply that can't be sent, and is logged if `onError` can't take it.
   */
  | { type: 'report'; error: TRPCError; internal: boolean }
  /**
   * An event the state can't take, which the interpreter never sends. The
   * subscription is left as it was, with nothing to wait for, so it ends.
   */
  | { type: 'invariantViolation'; message: string };

/** The effects that wait for the world, and whose outcome is the next event. */
export const awaitingEffects = [
  'setUp',
  'send',
  'open',
  'next',
  'close',
] as const satisfies readonly SubscriptionEffect['type'][];

type SubscriptionTransition = MachineTransition<
  SubscriptionState,
  SubscriptionEffect
>;

const ended: SubscriptionTransition = {
  state: { status: 'ended' },
  effects: [],
};

function to(
  state: SubscriptionState,
  ...effects: SubscriptionEffect[]
): SubscriptionTransition {
  return { state, effects };
}

function report(error: TRPCError): SubscriptionEffect {
  return { type: 'report', error, internal: false };
}

function reportInternal(error: TRPCError): SubscriptionEffect {
  return { type: 'report', error, internal: true };
}

function sendStopped(cleanupError: TRPCError | null): SubscriptionTransition {
  return to(
    { status: 'sendingStopped' },
    ...(cleanupError === null ? [] : [report(cleanupError)]),
    { type: 'send', reply: { kind: 'stopped' } },
  );
}

function afterReply(after: AfterReply): SubscriptionTransition {
  return after.then === 'end' ? ended : sendStopped(after.cleanupError);
}

/** Reports `error`, and sends it as the reply that ends the subscription. */
function sendError(
  error: TRPCError,
  after: AfterReply,
  ...before: SubscriptionEffect[]
): SubscriptionTransition {
  return to(
    { status: 'sendingError', error, after },
    ...before,
    report(error),
    {
      type: 'send',
      reply: { kind: 'error', error },
    },
  );
}

function close(end: SubscriptionEnd): SubscriptionTransition {
  return to(
    { status: 'closing', end },
    // before the iterator's disposal, so that a cleanup that waits for
    // cancellation is woken
    ...(end.kind === 'completed' ? [] : [{ type: 'abort' } as const]),
    { type: 'close' },
  );
}

function closed(
  end: SubscriptionEnd,
  cleanupError: TRPCError | null,
): SubscriptionTransition {
  // a failed cleanup aborts even a completed subscription, and the client
  // still gets `stopped`, so that it doesn't turn into a failed one
  const abort: SubscriptionEffect[] =
    cleanupError !== null && end.kind === 'completed'
      ? [{ type: 'abort' }]
      : [];
  if (end.kind === 'failed') {
    return sendError(end.error, { then: 'stopped', cleanupError }, ...abort);
  }
  const stopped = sendStopped(cleanupError);
  return to(stopped.state, ...abort, ...stopped.effects);
}

function illegal(
  state: SubscriptionState,
  event: SubscriptionEvent,
): SubscriptionTransition {
  return to(state, {
    type: 'invariantViolation',
    message: `a subscription that is ${state.status} can't take ${event.type}`,
  });
}

/** What a `send` that went out, or didn't, leads to. */
function replied(
  state: SubscriptionState,
  event: Extract<SubscriptionEvent, { type: 'sent' | 'sendFailed' }>,
): SubscriptionTransition {
  const failed = event.type === 'sendFailed';
  switch (state.status) {
    case 'sendingStarted':
      return to(
        { status: 'opening', startedError: failed ? event.error : null },
        { type: 'open' },
      );
    case 'sendingValue':
      return failed
        ? close({ kind: 'failed', error: event.error })
        : to({ status: 'pulling' }, { type: 'next' });
    case 'sendingError':
      return failed
        ? to(
            { status: 'sendingFallback', after: state.after },
            reportInternal(event.error),
            { type: 'send', reply: { kind: 'fallback', error: state.error } },
          )
        : afterReply(state.after);
    case 'sendingFallback':
    case 'sendingStopped': {
      const next = afterReply(
        state.status === 'sendingFallback' ? state.after : { then: 'end' },
      );
      // nothing more can be sent about a reply that failed here
      return failed
        ? to(next.state, reportInternal(event.error), ...next.effects)
        : next;
    }
    case 'settingUp':
    case 'opening':
    case 'pulling':
    case 'closing':
    case 'ended':
      return illegal(state, event);
    default:
      return exhaustive(state, illegal(state, event));
  }
}

/** What the iterator's next step leads to. */
function pulled(
  event: Extract<
    SubscriptionEvent,
    { type: 'value' | 'completed' | 'stopped' | 'nextFailed' }
  >,
): SubscriptionTransition {
  switch (event.type) {
    case 'value':
      return to(
        { status: 'sendingValue' },
        { type: 'send', reply: { kind: 'value' } },
      );
    case 'completed':
      return close({ kind: 'completed' });
    case 'stopped':
      return close({ kind: 'stopped' });
    case 'nextFailed':
      return close({ kind: 'failed', error: event.error });
    default:
      return exhaustive(event, ended);
  }
}

/**
 * Each event is the outcome of the effect the state waits for, so each is
 * taken in the states that wait for that effect, and is illegal elsewhere.
 */
function transition(
  state: SubscriptionState,
  event: SubscriptionEvent,
): SubscriptionTransition {
  switch (event.type) {
    case 'setUp':
      return state.status === 'settingUp'
        ? to(
            { status: 'sendingStarted' },
            { type: 'send', reply: { kind: 'started' } },
          )
        : illegal(state, event);
    case 'setUpCancelled':
      return state.status === 'settingUp'
        ? sendStopped(null)
        : illegal(state, event);
    case 'setUpFailed':
      return state.status === 'settingUp'
        ? sendError(event.error, { then: 'end' })
        : illegal(state, event);
    case 'sent':
    case 'sendFailed':
      return replied(state, event);
    case 'opened':
      if (state.status !== 'opening') {
        return illegal(state, event);
      }
      return state.startedError === null
        ? to({ status: 'pulling' }, { type: 'next' })
        : close({ kind: 'failed', error: state.startedError });
    case 'openFailed':
      if (state.status !== 'opening') {
        return illegal(state, event);
      }
      return sendError(
        event.error,
        { then: 'stopped', cleanupError: null },
        { type: 'abort' },
        ...(state.startedError === null ? [] : [report(state.startedError)]),
      );
    case 'value':
    case 'completed':
    case 'stopped':
    case 'nextFailed':
      return state.status === 'pulling' ? pulled(event) : illegal(state, event);
    case 'closed':
    case 'closeFailed':
      return state.status === 'closing'
        ? closed(state.end, event.type === 'closeFailed' ? event.error : null)
        : illegal(state, event);
    default:
      return exhaustive(event, illegal(state, event));
  }
}

export const subscriptionMachine: StateMachine<
  SubscriptionState,
  SubscriptionEvent,
  SubscriptionEffect
> = {
  initial: to({ status: 'settingUp' }, { type: 'setUp' }),
  transition,
};
