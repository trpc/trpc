// @vitest-environment node
/**
 * A model-based test of the WebSocket server's protocol. It sends random
 * sequences of requests over a plain socket to a real server, and checks
 * after every step that each id got exactly the replies the model expects,
 * that `onError` was called as often as it should be, and that nothing
 * escaped as an uncaught exception or unhandled rejection. Once the socket
 * closes, every subscription's generator must have finished.
 */
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import { observable } from '@trpc/server/observable';
import type { TRPCResponseMessage } from '@trpc/server/rpc';
import {
  createDeferred,
  makeAsyncResource,
  makeResource,
  run,
} from '@trpc/server/unstable-core-do-not-import';
import fc from 'fast-check';
import WebSocket from 'ws';
import { z } from 'zod';

type OnError = NonNullable<WSSHandlerOptions<AnyRouter>['onError']>;

const behaviours = [
  'stream',
  'observable',
  'failSetup',
  'gated',
  'throwingCleanup',
  'throwingReturn',
] as const;
/**
 * - `stream`: an async generator that sends what the test pushes to it.
 * - `observable`: the same, as an observable.
 * - `failSetup`: its middleware throws, so it never starts.
 * - `gated`: its middleware waits for the test to release it, ignoring
 *   a stop.
 * - `throwingCleanup`: a `stream` whose `finally` throws.
 * - `throwingReturn`: a `stream` behind an iterator whose `return()` throws,
 *   which the server calls whenever the subscription ends.
 */
type Behaviour = (typeof behaviours)[number];

type ChannelEvent = 'value' | 'complete' | 'fail';

/** What the test pushes to one subscription, buffered until it's read. */
function createChannel() {
  const events: ChannelEvent[] = [];
  let wake: (() => void) | null = null;
  let listener: ((event: ChannelEvent) => void) | null = null;
  return {
    gate: createDeferred(),
    push(event: ChannelEvent) {
      if (listener) {
        listener(event);
        return;
      }
      events.push(event);
      wake?.();
    },
    /** Sends the buffered events and then every new one to `onEvent`. */
    listen(onEvent: (event: ChannelEvent) => void) {
      for (const event of events.splice(0)) {
        onEvent(event);
      }
      listener = onEvent;
      return () => {
        listener = null;
      };
    },
    async next(signal: AbortSignal): Promise<ChannelEvent> {
      while (events.length === 0) {
        signal.throwIfAborted();
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => reject(signal.reason);
          signal.addEventListener('abort', onAbort, { once: true });
          wake = () => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          };
        });
        wake = null;
      }
      return events.shift()!;
    },
  };
}
type Channel = ReturnType<typeof createChannel>;

function createServerState() {
  const channels = new Map<string, Channel>();
  const state = {
    channels,
    /** Subscription generators that have started and not finished. */
    running: 0,
  };
  const t = initTRPC.create();
  const subscriptionProcedure = t.procedure
    .input(z.object({ key: z.string(), behaviour: z.enum(behaviours) }))
    .use(async ({ input, next }) => {
      if (input.behaviour === 'failSetup') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'setup failed' });
      }
      if (input.behaviour === 'gated') {
        await channels.get(input.key)!.gate.promise;
      }
      return next();
    });
  const router = t.router({
    greeting: t.procedure.query(() => 'hello'),
    generator: subscriptionProcedure.subscription(({ input, signal }) => {
      const values = stream(channels.get(input.key)!, input.behaviour, signal!);
      if (input.behaviour !== 'throwingReturn') {
        return values;
      }
      return {
        [Symbol.asyncIterator]: (): AsyncIterator<number> => ({
          next: () => values.next(),
          async return() {
            await values.return();
            throw new Error('return failed');
          },
        }),
      };
    }),
    observable: subscriptionProcedure.subscription(({ input }) => {
      const channel = channels.get(input.key)!;
      return observable<number>((emit) => {
        state.running++;
        let value = 0;
        const stopListening = channel.listen((event) => {
          if (event === 'value') {
            emit.next(value++);
          } else if (event === 'complete') {
            emit.complete();
          } else {
            emit.error(new Error('stream failed'));
          }
        });
        return () => {
          stopListening();
          state.running--;
        };
      });
    }),
  });

  async function* stream(
    channel: Channel,
    behaviour: Behaviour,
    signal: AbortSignal,
  ) {
    state.running++;
    try {
      let value = 0;
      while (true) {
        const event = await channel.next(signal);
        if (event === 'complete') {
          return;
        }
        if (event === 'fail') {
          throw new Error('stream failed');
        }
        yield value++;
      }
    } finally {
      state.running--;
      if (behaviour === 'throwingCleanup') {
        throw new Error('cleanup failed');
      }
    }
  }
  return { state, router };
}

type ReplyKind = 'started' | 'data' | 'error' | 'stopped' | 'pong';
type Reply = { kind: ReplyKind; data?: unknown };

function replyOf(message: TRPCResponseMessage): Reply {
  if ('error' in message) {
    return { kind: 'error' };
  }
  const { result } = message;
  if (result.type === 'data') {
    return { kind: 'data', data: result.data };
  }
  return { kind: result.type ?? 'data' };
}

/** A subscription the model expects to hold its id. */
type ModelSubscription = {
  key: string;
  behaviour: Behaviour;
  /** `gated` until the test releases it, then `live`. */
  phase: 'gated' | 'live';
  stopRequested: boolean;
  nextValue: number;
};

type Model = {
  held: Map<string, ModelSubscription>;
  /** Every reply each id should have got, in order. */
  replies: Map<string, Reply[]>;
  onErrorCalls: number;
  keys: number;
  queries: number;
};

const subscriptionIds = ['s0', 's1', 's2'] as const;
type SubscriptionId = (typeof subscriptionIds)[number];

type Action =
  | { type: 'subscribe'; id: SubscriptionId; behaviour: Behaviour }
  /** A subscription and its stop in one batch. */
  | { type: 'subscribeAndStop'; id: SubscriptionId; behaviour: Behaviour }
  | {
      type: 'emit' | 'complete' | 'fail' | 'stop' | 'release';
      id: SubscriptionId;
    }
  | { type: 'query' }
  | { type: 'garbage' }
  | { type: 'ping' };

const idArb = fc.constantFrom(...subscriptionIds);
const behaviourArb = fc.constantFrom(...behaviours);
const actionArb: fc.Arbitrary<Action> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({
      type: fc.constant('subscribe' as const),
      id: idArb,
      behaviour: behaviourArb,
    }),
  },
  fc.record({
    type: fc.constant('subscribeAndStop' as const),
    id: idArb,
    behaviour: behaviourArb,
  }),
  {
    weight: 4,
    arbitrary: fc.record({ type: fc.constant('emit' as const), id: idArb }),
  },
  fc.record({
    type: fc.constantFrom(
      'complete' as const,
      'fail' as const,
      'stop' as const,
      'release' as const,
    ),
    id: idArb,
  }),
  fc.record({
    type: fc.constantFrom(
      'query' as const,
      'garbage' as const,
      'ping' as const,
    ),
  }),
);

const scenarioArb = fc.record({
  connectionParams: fc.boolean(),
  slowContext: fc.boolean(),
  actions: fc.array(actionArb, { maxLength: 20 }),
});
type Scenario = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never;

/** A plain `ws` client that records the replies it gets, by id. */
async function rawSocketResource(url: string) {
  const ws = new WebSocket(url);
  const replies = new Map<string, Reply[]>();
  let count = 0;
  ws.on('message', (data) => {
    assert(Buffer.isBuffer(data));
    const text = data.toString('utf8');
    const [id, reply] =
      text === 'PONG'
        ? ['pong', { kind: 'pong' } as const]
        : run(() => {
            const message = JSON.parse(text) as TRPCResponseMessage;
            return [String(message.id), replyOf(message)] as const;
          });
    replies.set(id, [...(replies.get(id) ?? []), reply]);
    count++;
  });
  ws.on('error', () => {
    // a socket error closes the socket, which the test notices
  });
  const closed = new Promise<void>((resolve) => {
    ws.once('close', () => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return makeAsyncResource(
    {
      ws,
      closed,
      replies,
      count: () => count,
      send: (message: unknown) => ws.send(JSON.stringify(message)),
    },
    async () => {
      ws.terminate();
      await closed;
    },
  );
}

/** Collects what would crash the process outside of Vitest. */
function processErrorsResource() {
  const errors: unknown[] = [];
  const listener = (error: unknown) => {
    errors.push(error);
  };
  process.on('uncaughtException', listener);
  process.on('unhandledRejection', listener);
  return makeResource({ errors }, () => {
    process.off('uncaughtException', listener);
    process.off('unhandledRejection', listener);
  });
}

function expectReply(model: Model, id: string, ...replies: Reply[]) {
  model.replies.set(id, [...(model.replies.get(id) ?? []), ...replies]);
}

const started: Reply = { kind: 'started' };
const stopped: Reply = { kind: 'stopped' };
const error: Reply = { kind: 'error' };

function subscriptionMessage(id: string, key: string, behaviour: Behaviour) {
  return {
    id,
    method: 'subscription',
    params: {
      path: behaviour === 'observable' ? 'observable' : 'generator',
      input: { key, behaviour },
    },
  };
}

function totalReplies(replies: Map<string, Reply[]>) {
  let total = 0;
  for (const list of replies.values()) {
    total += list.length;
  }
  return total;
}

async function runScenario(scenario: Scenario) {
  using processErrors = processErrorsResource();
  const { state, router } = createServerState();
  let onErrorCalls = 0;
  const onError: OnError = () => {
    onErrorCalls++;
  };
  await using ctx = testServerAndClientResource(router, {
    wssServer: {
      onError,
      createContext: async () => {
        if (scenario.slowContext) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        return {};
      },
    },
  });
  const model: Model = {
    held: new Map(),
    replies: new Map(),
    onErrorCalls: 0,
    keys: 0,
    queries: 0,
  };
  await runActions();

  for (const channel of state.channels.values()) {
    channel.gate.resolve();
  }
  await vi.waitFor(
    () => {
      expect(state.running, 'running generators').toBe(0);
      expect(onErrorCalls, 'onError calls after close').toBe(
        model.onErrorCalls,
      );
    },
    { timeout: 1_000, interval: 1 },
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(processErrors.errors).toEqual([]);

  /** Runs the actions, and then closes the socket. */
  async function runActions() {
    await using socket = await rawSocketResource(
      scenario.connectionParams
        ? `${ctx.wssUrl}?connectionParams=1`
        : ctx.wssUrl,
    );
    if (scenario.connectionParams) {
      socket.send({ method: 'connectionParams', data: { token: 'x' } });
    }

    async function settled(step: string) {
      const expected = totalReplies(model.replies);
      await vi.waitFor(
        () => {
          if (socket.count() < expected) {
            throw new Error(`waiting for ${expected} replies`);
          }
        },
        { timeout: 1_000, interval: 1 },
      );
      await new Promise((resolve) => setTimeout(resolve, 2));
      const received = Object.fromEntries(socket.replies);
      expect(received, step).toEqual(Object.fromEntries(model.replies));
      expect(onErrorCalls, `${step}: onError calls`).toBe(model.onErrorCalls);
      expect(processErrors.errors, step).toEqual([]);
    }

    function newKey(id: string, behaviour: Behaviour) {
      const key = `${id}#${model.keys++}`;
      state.channels.set(key, createChannel());
      model.held.set(id, {
        key,
        behaviour,
        phase: behaviour === 'gated' ? 'gated' : 'live',
        stopRequested: false,
        nextValue: 0,
      });
      return key;
    }

    /** What a stop does to a held subscription. */
    function stopHeld(id: string, held: ModelSubscription) {
      if (held.phase === 'gated') {
        held.stopRequested = true;
        return;
      }
      model.held.delete(id);
      expectReply(model, id, stopped);
      model.onErrorCalls += stopReports(held.behaviour);
    }

    for (const [index, action] of scenario.actions.entries()) {
      const step = `step ${index}: ${JSON.stringify(action)}`;
      switch (action.type) {
        case 'subscribe':
        case 'subscribeAndStop': {
          const { id, behaviour } = action;
          const held = model.held.get(id);
          let key = 'duplicate';
          if (held) {
            expectReply(model, id, error);
            model.onErrorCalls++;
          } else {
            key = newKey(id, behaviour);
          }
          const subscription = subscriptionMessage(id, key, behaviour);
          if (action.type === 'subscribe') {
            socket.send(subscription);
            if (!held) {
              if (behaviour === 'failSetup') {
                model.held.delete(id);
                expectReply(model, id, error);
                model.onErrorCalls++;
              } else if (behaviour !== 'gated') {
                expectReply(model, id, started);
              }
            }
            break;
          }
          socket.send([subscription, { id, method: 'subscription.stop' }]);
          if (held) {
            stopHeld(id, held);
          } else {
            // stopped before its procedure is called
            model.held.delete(id);
            expectReply(model, id, stopped);
          }
          break;
        }
        case 'emit': {
          const held = model.held.get(action.id);
          if (held?.phase !== 'live') {
            break;
          }
          state.channels.get(held.key)!.push('value');
          expectReply(model, action.id, {
            kind: 'data',
            data: held.nextValue++,
          });
          break;
        }
        case 'complete':
        case 'fail': {
          const held = model.held.get(action.id);
          if (held?.phase !== 'live') {
            break;
          }
          state.channels.get(held.key)!.push(action.type);
          model.held.delete(action.id);
          if (action.type === 'fail' || held.behaviour === 'throwingCleanup') {
            expectReply(model, action.id, error, stopped);
            model.onErrorCalls++;
          } else {
            expectReply(model, action.id, stopped);
          }
          if (held.behaviour === 'throwingReturn') {
            // a failed cleanup is reported, but doesn't fail the subscription
            model.onErrorCalls++;
          }
          break;
        }
        case 'stop': {
          socket.send({ id: action.id, method: 'subscription.stop' });
          const held = model.held.get(action.id);
          if (held) {
            stopHeld(action.id, held);
          }
          break;
        }
        case 'release': {
          const held = model.held.get(action.id);
          if (held?.phase !== 'gated') {
            break;
          }
          state.channels.get(held.key)!.gate.resolve();
          if (held.stopRequested) {
            // its iterable is disposed without being read
            model.held.delete(action.id);
            expectReply(model, action.id, stopped);
          } else {
            held.phase = 'live';
            expectReply(model, action.id, started);
          }
          break;
        }
        case 'query': {
          const id = `q${model.queries++}`;
          socket.send({ id, method: 'query', params: { path: 'greeting' } });
          expectReply(model, id, { kind: 'data', data: 'hello' });
          break;
        }
        case 'ping': {
          socket.ws.send('PING');
          expectReply(model, 'pong', { kind: 'pong' });
          break;
        }
        case 'garbage': {
          // answered, but not reported to `onError`
          socket.ws.send('not json');
          expectReply(model, 'null', error);
          break;
        }
      }
      await settled(step);
    }

    // Closing the connection stops every subscription. Only a live one has
    // an iterator to clean up.
    for (const held of model.held.values()) {
      if (held.phase === 'live') {
        model.onErrorCalls += stopReports(held.behaviour);
      }
    }
  }
}

/** How many errors stopping a live subscription reports to `onError`. */
function stopReports(behaviour: Behaviour) {
  return behaviour === 'throwingCleanup' || behaviour === 'throwingReturn'
    ? 1
    : 0;
}

test('random request sequences get the replies the model expects', async () => {
  await fc.assert(fc.asyncProperty(scenarioArb, runScenario), {
    seed: 7895,
    numRuns: 150,
  });
}, 120_000);
