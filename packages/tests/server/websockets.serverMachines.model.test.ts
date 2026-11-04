import { check, coverage, simulateMachine } from './___machineModel';
import { TRPCError } from '@trpc/server';
import type {
  KeepAliveEvent,
  KeepAliveState,
} from '@trpc/server/adapters/ws-machines/keepAlive';
import { keepAliveMachine } from '@trpc/server/adapters/ws-machines/keepAlive';
import type {
  SubscriptionEffect,
  SubscriptionEvent,
  SubscriptionReply,
} from '@trpc/server/adapters/ws-machines/subscription';
import {
  awaitingEffects,
  subscriptionMachine,
} from '@trpc/server/adapters/ws-machines/subscription';
import type { DiagramEdge } from '@trpc/server/unstable-core-do-not-import';
import {
  sampleTransitions,
  stateDiagram,
} from '@trpc/server/unstable-core-do-not-import';
import fc from 'fast-check';

const SEED = 7895;

// --- a subscription ----------------------------------------------------------

type Awaiting = (typeof awaitingEffects)[number];

/** What the world can answer each effect a subscription waits for with. */
const outcomes = {
  setUp: ['setUp', 'setUpCancelled', 'setUpFailed'],
  send: ['sent', 'sendFailed'],
  open: ['opened', 'openFailed'],
  next: ['value', 'completed', 'stopped', 'nextFailed'],
  close: ['closed', 'closeFailed'],
} as const satisfies Record<Awaiting, readonly SubscriptionEvent['type'][]>;

const isAwaiting = (effect: SubscriptionEffect) =>
  (awaitingEffects as readonly string[]).includes(effect.type);

const terminalReplies: readonly SubscriptionReply['kind'][] = [
  'error',
  'fallback',
  'stopped',
];

const subscriptionGoals = coverage([
  'cancelled during setup',
  'failed setup',
  'started could not be sent',
  'open failed',
  'value sent',
  'value could not be sent',
  'completed',
  'stopped',
  'next failed',
  'cleanup failed after completing',
  'error could not be sent, fallback sent',
  'fallback could not be sent',
  'stopped could not be sent',
]);

const subscriptionEdges = new Map<string, DiagramEdge>();

/**
 * Plays a subscription to its end, answering each effect it waits for with
 * the outcome `choices` picks. Once `choices` runs out, each effect gets the
 * outcome that ends it soonest.
 */
function runSubscription(choices: readonly number[]) {
  const world = {
    awaiting: null as {
      effect: Awaiting;
      reply: SubscriptionReply | null;
    } | null,
    iterator: 'none' as 'none' | 'opening' | 'open' | 'closing' | 'closed',
    aborted: false,
    /** Whether the iterator completed, and its cleanup didn't throw. */
    cleanEnd: false,
    /** Every reply that went out. */
    delivered: [] as SubscriptionReply['kind'][],
    /** The errors the machine was given, and how often each was reported. */
    errors: new Map<TRPCError, number>(),
    /** Why final replies couldn't be sent, and how often each was logged. */
    unsentFinal: new Map<TRPCError, number>(),
  };

  const model = simulateMachine({
    machine: subscriptionMachine,
    check({ event, before, after, effects }) {
      if (before !== null && event !== null) {
        const edge = {
          from: before.status,
          to: after.status,
          label: event.type,
        };
        subscriptionEdges.set(JSON.stringify(edge), edge);
      }
      const awaiting = effects.filter(isAwaiting);
      check(awaiting.length <= 1, 'more than one effect to wait for');
      check(
        awaiting.length === 0 || effects.at(-1) === awaiting[0],
        'an effect after the one waited for',
      );
      check(
        (awaiting.length === 0) === (after.status === 'ended'),
        `${after.status} waiting for ${awaiting.length} effects`,
      );
    },
    play(effect, { state }) {
      if (isAwaiting(effect)) {
        check(world.awaiting === null, 'a second effect waited for');
        world.awaiting = {
          effect: effect.type as Awaiting,
          reply: effect.type === 'send' ? effect.reply : null,
        };
      }
      switch (effect.type) {
        case 'setUp':
          return;
        case 'send':
          check(
            !world.delivered.includes('stopped'),
            `${effect.reply.kind} after stopped`,
          );
          if (
            effect.reply.kind === 'value' ||
            effect.reply.kind === 'started'
          ) {
            check(
              !world.delivered.some((kind) => terminalReplies.includes(kind)),
              `${effect.reply.kind} after the subscription ended`,
            );
          }
          return;
        case 'open':
          check(world.iterator === 'none', 'a second iterator');
          world.iterator = 'opening';
          return;
        case 'next':
          check(
            world.iterator === 'open',
            `next with ${world.iterator} iterator`,
          );
          return;
        case 'close':
          check(
            world.iterator === 'open',
            `close with ${world.iterator} iterator`,
          );
          check(
            state.status === 'closing' &&
              (state.end.kind === 'completed' || world.aborted),
            'an iterator closed before it was aborted',
          );
          world.iterator = 'closing';
          return;
        case 'abort':
          check(!world.aborted, 'aborted twice');
          world.aborted = true;
          return;
        case 'report': {
          const errors = effect.internal ? world.unsentFinal : world.errors;
          const reported = errors.get(effect.error);
          check(reported !== undefined, 'an error the machine was not given');
          errors.set(effect.error, reported + 1);
          return;
        }
        case 'invariantViolation':
          check(false, effect.message);
          return;
        default:
          effect satisfies never;
      }
    },
  });

  let index = 0;
  while (world.awaiting !== null) {
    const { effect, reply } = world.awaiting;
    const options = outcomes[effect];
    const choice = choices[index++];
    const type: SubscriptionEvent['type'] =
      choice === undefined
        ? effect === 'next'
          ? 'completed'
          : options[0]
        : options[choice % options.length]!;
    world.awaiting = null;

    const error = new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    switch (type) {
      case 'setUpCancelled':
        subscriptionGoals.add('cancelled during setup');
        break;
      case 'setUpFailed':
        subscriptionGoals.add('failed setup');
        break;
      case 'sent':
        world.delivered.push(reply!.kind);
        if (reply!.kind === 'value') subscriptionGoals.add('value sent');
        if (reply!.kind === 'fallback') {
          subscriptionGoals.add('error could not be sent, fallback sent');
        }
        break;
      case 'sendFailed':
        if (reply!.kind === 'started') {
          subscriptionGoals.add('started could not be sent');
        }
        if (reply!.kind === 'value')
          subscriptionGoals.add('value could not be sent');
        if (reply!.kind === 'fallback') {
          subscriptionGoals.add('fallback could not be sent');
        }
        if (reply!.kind === 'stopped') {
          subscriptionGoals.add('stopped could not be sent');
        }
        break;
      case 'opened':
        world.iterator = 'open';
        break;
      case 'openFailed':
        world.iterator = 'closed';
        subscriptionGoals.add('open failed');
        break;
      case 'completed':
        subscriptionGoals.add('completed');
        break;
      case 'stopped':
        subscriptionGoals.add('stopped');
        break;
      case 'nextFailed':
        subscriptionGoals.add('next failed');
        break;
      case 'closed':
      case 'closeFailed':
        world.iterator = 'closed';
        world.cleanEnd =
          type === 'closed' &&
          model.state.status === 'closing' &&
          model.state.end.kind === 'completed';
        if (
          type === 'closeFailed' &&
          model.state.status === 'closing' &&
          model.state.end.kind === 'completed'
        ) {
          subscriptionGoals.add('cleanup failed after completing');
        }
        break;
    }
    const event = (
      type === 'setUpFailed' ||
      type === 'sendFailed' ||
      type === 'openFailed' ||
      type === 'nextFailed' ||
      type === 'closeFailed'
        ? { type, error }
        : { type }
    ) as SubscriptionEvent;
    if ('error' in event) {
      const final =
        type === 'sendFailed' && terminalReplies.includes(reply!.kind);
      (final ? world.unsentFinal : world.errors).set(event.error, 0);
    }
    model.send(event);
  }

  check(model.state.status === 'ended', `stuck ${model.state.status}`);
  check(
    world.iterator === 'none' || world.iterator === 'closed',
    `ended with ${world.iterator} iterator`,
  );
  // the procedure's signal aborts unless its iterator completed cleanly
  check(
    world.aborted === (world.iterator === 'closed' && !world.cleanEnd),
    `aborted ${world.aborted} with ${world.iterator} iterator`,
  );
  for (const [error, reported] of world.errors) {
    check(reported === 1, `${error.message} reported ${reported} times`);
  }
  for (const [error, logged] of world.unsentFinal) {
    check(logged === 1, `unsent ${error.message} logged ${logged} times`);
  }
  // The client isn't left waiting: it was told how the subscription ended,
  // or the reply that would have told it couldn't be sent, and that's logged.
  check(
    world.delivered.some((kind) => terminalReplies.includes(kind)) ||
      world.unsentFinal.size > 0,
    'ended without a final reply',
  );
  if (world.delivered.includes('started')) {
    check(
      world.delivered.at(-1) === 'stopped' || world.unsentFinal.size > 0,
      'a started subscription that never said stopped',
    );
  }
}

const choicesArb = fc.array(fc.nat(11), { maxLength: 30, size: 'max' });

test('a subscription keeps every invariant, whatever its effects lead to', () => {
  subscriptionGoals.reset();
  fc.assert(fc.property(choicesArb, runSubscription), {
    seed: SEED,
    numRuns: 1_000,
  });
  expect(subscriptionGoals.missing()).toEqual([]);
});

test('a subscription keeps every invariant, unseeded', () => {
  fc.assert(fc.property(choicesArb, runSubscription), { numRuns: 1_000 });
});

// --- keepAlive ---------------------------------------------------------------

type KeepAliveAction = 'message' | 'firePing' | 'firePong' | 'close';

const keepAliveGoals = coverage([
  'pinged',
  'answered',
  'terminated',
  'closed while awaiting pong',
  'a message put off the ping',
]);

const timing = { pingMs: 30_000, pongWaitMs: 5_000 };

function runKeepAlive(actions: readonly KeepAliveAction[]) {
  const world = {
    ping: false,
    pong: false,
    socket: 'open' as 'open' | 'closed' | 'terminated',
    pings: 0,
  };
  const model = simulateMachine({
    machine: keepAliveMachine(timing),
    check({ event, before, after, effects }) {
      if (before?.status === 'listening' && event?.type === 'message') {
        keepAliveGoals.add('a message put off the ping');
      }
      if (before?.status === 'awaitingPong' && after.status === 'listening') {
        keepAliveGoals.add('answered');
      }
      if (before?.status === 'awaitingPong' && event?.type === 'closed') {
        keepAliveGoals.add('closed while awaiting pong');
      }
      if (effects.some((effect) => effect.type === 'terminate')) {
        check(before?.status === 'awaitingPong', 'terminated without a ping');
      }
    },
    play(effect) {
      check(
        world.socket === 'open',
        `${effect.type} on a ${world.socket} socket`,
      );
      switch (effect.type) {
        case 'startTimer':
          world[effect.timer] = true;
          check(
            effect.ms ===
              (effect.timer === 'ping' ? timing.pingMs : timing.pongWaitMs),
            'a timer of the wrong length',
          );
          return;
        case 'cancelTimer':
          check(world[effect.timer], `${effect.timer} cancelled, not running`);
          world[effect.timer] = false;
          return;
        case 'sendPing':
          world.pings++;
          keepAliveGoals.add('pinged');
          return;
        case 'terminate':
          world.socket = 'terminated';
          keepAliveGoals.add('terminated');
          return;
        default:
          effect satisfies never;
      }
    },
  });

  for (const action of actions) {
    if (world.socket !== 'open') break;
    switch (action) {
      case 'message':
        model.send({ type: 'message' });
        break;
      case 'firePing':
      case 'firePong': {
        const timer = action === 'firePing' ? 'ping' : 'pong';
        if (!world[timer]) break;
        world[timer] = false;
        model.send({ type: 'timer', timer });
        break;
      }
      case 'close':
        model.send({ type: 'closed' });
        world.socket = 'closed';
        break;
      default:
        action satisfies never;
    }
    const { status } = model.state;
    check(
      world.ping === (status === 'listening'),
      `${status} with ping timer ${world.ping}`,
    );
    check(
      world.pong === (status === 'awaitingPong'),
      `${status} with pong timer ${world.pong}`,
    );
    check(
      (status === 'stopped') === (world.socket !== 'open'),
      `${status} with ${world.socket} socket`,
    );
  }
}

const keepAliveArb = fc.array(
  fc.constantFrom<KeepAliveAction>('message', 'firePing', 'firePong', 'close'),
  { maxLength: 40, size: 'max' },
);

test('keepAlive keeps every invariant', () => {
  keepAliveGoals.reset();
  fc.assert(fc.property(keepAliveArb, runKeepAlive), {
    seed: SEED,
    numRuns: 500,
  });
  expect(keepAliveGoals.missing()).toEqual([]);
});

test('keepAlive keeps every invariant, unseeded', () => {
  fc.assert(fc.property(keepAliveArb, runKeepAlive), { numRuns: 500 });
});

// --- diagrams ----------------------------------------------------------------

test('the diagrams match the machines', async () => {
  // edges the seeded run reached, so the subscription test runs first
  subscriptionEdges.clear();
  fc.assert(fc.property(choicesArb, runSubscription), {
    seed: SEED,
    numRuns: 1_000,
  });
  const subscription = stateDiagram({
    initial: [{ to: 'settingUp', label: null }],
    edges: subscriptionEdges.values(),
    final: ['ended'],
    sort: true,
  });

  const machine = keepAliveMachine(timing);
  const keepAlive = stateDiagram({
    initial: [{ to: 'listening', label: null }],
    edges: sampleTransitions({
      states: [
        { status: 'listening' },
        { status: 'awaitingPong' },
        { status: 'stopped' },
      ] satisfies KeepAliveState[],
      events: [
        { type: 'message' },
        { type: 'timer', timer: 'ping' },
        { type: 'timer', timer: 'pong' },
        { type: 'closed' },
      ] satisfies KeepAliveEvent[],
      next(state, event) {
        const step = machine.transition(state, event);
        return step.state === state ? null : step.state;
      },
      stateName: (state) => state.status,
      eventName: (event) =>
        event.type === 'timer' ? `${event.timer} timer` : event.type,
    }),
    final: ['stopped'],
    sort: false,
  });

  await expect(
    [
      '# WebSocket server state machines',
      '',
      'Generated by `websockets.serverMachines.model.test.ts`.',
      '',
      '## A subscription',
      '',
      'Edges reached by the seeded model run. Each event is the outcome of the effect the state waits for.',
      '',
      '```mermaid',
      subscription,
      '```',
      '',
      '## keepAlive',
      '',
      '```mermaid',
      keepAlive,
      '```',
      '',
    ].join('\n'),
  ).toMatchFileSnapshot('./websockets.serverMachines.diagrams.md');
});
