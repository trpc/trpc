import { check, coverage, simulateMachine } from './___machineModel';
import { fc, test } from '@fast-check/vitest';
import { observable, observableToAsyncIterable } from '@trpc/server/observable';
import type {
  MachineTransition,
  StateMachine,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createMachineRuntime,
  createMachineTimers,
  createResourceMap,
  exhaustive,
  makeResource,
  sampleTransitions,
  stateDiagram,
} from '@trpc/server/unstable-core-do-not-import';

// A reconnecting socket with backoff: the smallest machine with the shape
// of the WebSocket client's.

type State =
  | { status: 'idle' }
  | { status: 'connecting'; attempt: number }
  | { status: 'open' }
  | { status: 'waiting'; attempt: number };
type Event =
  | { type: 'connect' }
  | { type: 'opened' }
  | { type: 'lost' }
  | { type: 'timer' }
  | { type: 'close' };
type Effect =
  | { type: 'openSocket' }
  | { type: 'closeSocket' }
  | { type: 'startTimer'; ms: number }
  | { type: 'cancelTimer' };
type Step = MachineTransition<State, Effect>;

const backoffMs = (attempt: number) => Math.min(1_000 * 2 ** attempt, 30_000);

const idle: State = { status: 'idle' };
const wait = (attempt: number): Step => ({
  state: { status: 'waiting', attempt },
  effects: [{ type: 'startTimer', ms: backoffMs(attempt) }],
});

function transition(state: State, event: Event): Step {
  const stay: Step = { state, effects: [] };
  switch (state.status) {
    case 'idle':
      if (event.type !== 'connect') return stay;
      return {
        state: { status: 'connecting', attempt: 0 },
        effects: [{ type: 'openSocket' }],
      };
    case 'connecting':
      switch (event.type) {
        case 'opened':
          return { state: { status: 'open' }, effects: [] };
        case 'lost':
          return wait(state.attempt + 1);
        case 'close':
          return { state: idle, effects: [{ type: 'closeSocket' }] };
        case 'connect':
        case 'timer':
          return stay;
        default:
          return exhaustive(event, stay);
      }
    case 'open':
      switch (event.type) {
        // A socket that was open proves the server is there: retry at once.
        case 'lost':
          return {
            state: { status: 'connecting', attempt: 0 },
            effects: [{ type: 'openSocket' }],
          };
        case 'close':
          return { state: idle, effects: [{ type: 'closeSocket' }] };
        case 'connect':
        case 'opened':
        case 'timer':
          return stay;
        default:
          return exhaustive(event, stay);
      }
    case 'waiting':
      switch (event.type) {
        case 'timer':
          return {
            state: { status: 'connecting', attempt: state.attempt },
            effects: [{ type: 'openSocket' }],
          };
        // Someone is waiting: don't wait out the backoff.
        case 'connect':
          return {
            state: { status: 'connecting', attempt: state.attempt },
            effects: [{ type: 'cancelTimer' }, { type: 'openSocket' }],
          };
        case 'close':
          return { state: idle, effects: [{ type: 'cancelTimer' }] };
        case 'opened':
        case 'lost':
          return stay;
        default:
          return exhaustive(event, stay);
      }
    default:
      return exhaustive(state, stay);
  }
}

const machine: StateMachine<State, Event, Effect> = {
  initial: { state: idle, effects: [] },
  transition,
};

// --- the model-based test ---------------------------------------------------

type Action = 'connect' | 'close' | 'open' | 'drop' | 'fire';

const goals = coverage([
  'backed off twice in a row',
  'skipped the backoff',
  'closed while waiting',
  'retried at once after a loss',
]);

function runActions(actions: readonly Action[]) {
  const world = {
    socket: 'none' as 'none' | 'connecting' | 'open',
    timer: null as number | null,
  };
  const model = simulateMachine({
    machine,
    check({ before, after, effects }) {
      const timer = effects.find((effect) => effect.type === 'startTimer');
      if (after.status === 'waiting' && timer?.type === 'startTimer') {
        check(timer.ms === backoffMs(after.attempt), 'backoff out of step');
        if (after.attempt >= 2) goals.add('backed off twice in a row');
      }
      if (before?.status === 'waiting' && after.status === 'idle') {
        goals.add('closed while waiting');
      }
      if (
        before?.status === 'waiting' &&
        effects.some((effect) => effect.type === 'cancelTimer') &&
        after.status === 'connecting'
      ) {
        goals.add('skipped the backoff');
      }
      if (before?.status === 'open' && after.status === 'connecting') {
        goals.add('retried at once after a loss');
      }
    },
    play(effect) {
      switch (effect.type) {
        case 'openSocket':
          check(world.socket === 'none', 'a second socket');
          world.socket = 'connecting';
          return;
        case 'closeSocket':
          world.socket = 'none';
          return;
        case 'startTimer':
          check(world.timer === null, 'a second timer');
          world.timer = effect.ms;
          return;
        case 'cancelTimer':
          world.timer = null;
          return;
        default:
          effect satisfies never;
      }
    },
  });

  for (const action of actions) {
    switch (action) {
      case 'connect':
      case 'close':
        model.send({ type: action });
        break;
      case 'open':
        if (world.socket !== 'connecting') break;
        world.socket = 'open';
        model.send({ type: 'opened' });
        break;
      case 'drop':
        if (world.socket === 'none') break;
        world.socket = 'none';
        model.send({ type: 'lost' });
        break;
      case 'fire':
        if (world.timer === null) break;
        world.timer = null;
        model.send({ type: 'timer' });
        break;
      default:
        action satisfies never;
    }
    // After every step, the machine and the world agree.
    const { status } = model.state;
    check(
      (status === 'connecting' || status === 'open') ===
        (world.socket !== 'none'),
      `${status} with socket ${world.socket}`,
    );
    check(
      (status === 'waiting') === (world.timer !== null),
      `${status} with timer ${world.timer}`,
    );
  }
}

const actionsArb = fc.array(
  fc.constantFrom<Action>('connect', 'close', 'open', 'drop', 'fire'),
  { maxLength: 50, size: 'max' },
);

describe('reaching every coverage goal', () => {
  beforeAll(() => goals.reset());
  test.prop([actionsArb], {
    seed: 7925,
    numRuns: 500,
    reporter: goals.report,
  })('random action sequences keep every invariant', runActions);
});

test.prop([actionsArb], { numRuns: 500 })(
  'random action sequences keep every invariant, unseeded',
  runActions,
);

test('the diagram matches the transition', () => {
  const edges = sampleTransitions({
    states: [
      idle,
      { status: 'connecting', attempt: 0 },
      { status: 'open' },
      { status: 'waiting', attempt: 1 },
    ] satisfies State[],
    events: [
      { type: 'connect' },
      { type: 'opened' },
      { type: 'lost' },
      { type: 'timer' },
      { type: 'close' },
    ] satisfies Event[],
    next(state, event) {
      const step = transition(state, event);
      return step.state === state ? null : step.state;
    },
    stateName: (state) => state.status,
    eventName: (event) => event.type,
  });
  expect(
    stateDiagram({
      initial: [{ to: 'idle', label: null }],
      edges,
      final: [],
      sort: false,
    }),
  ).toMatchInlineSnapshot(`
    "stateDiagram-v2
      [*] --> idle
      idle --> connecting : connect
      connecting --> open : opened
      connecting --> waiting : lost
      connecting --> idle : close
      open --> connecting : lost
      open --> idle : close
      waiting --> connecting : connect, timer
      waiting --> idle : close"
  `);
});

// --- the same machine, run for real ------------------------------------------

function fakeSocket() {
  let emit: (event: Event) => void = () => {
    // not read yet
  };
  let complete = () => {
    // not read yet
  };
  const state = { closed: false, listening: false };
  const events = observableToAsyncIterable(
    observable<Event, never>((observer) => {
      state.listening = true;
      emit = (event) => observer.next(event);
      complete = () => observer.complete();
      return () => {
        state.listening = false;
      };
    }),
    new AbortController().signal,
  );
  return makeResource(
    {
      events,
      state,
      open: () => emit({ type: 'opened' }),
      drop() {
        emit({ type: 'lost' });
        complete();
      },
    },
    () => {
      state.closed = true;
      complete();
    },
  );
}

test('the runtime runs it with sockets and timers as async iterables', async () => {
  vi.useFakeTimers();
  const opened: ReturnType<typeof fakeSocket>[] = [];
  const runtime = createMachineRuntime({
    machine,
    run(effect, runtime) {
      switch (effect.type) {
        case 'openSocket': {
          const socket = fakeSocket();
          opened.push(socket);
          sockets.set('current', socket);
          runtime.intake(socket.events, runtime.send);
          return;
        }
        case 'closeSocket':
          sockets.delete('current');
          return;
        case 'startTimer':
          timers.start('backoff', effect.ms);
          return;
        case 'cancelTimer':
          timers.cancel('backoff');
          return;
        default:
          effect satisfies never;
      }
    },
    onError: (error) => {
      throw error;
    },
  });
  const sockets =
    runtime.use(createResourceMap<'current', ReturnType<typeof fakeSocket>>());
  const timers = runtime.use(createMachineTimers<'backoff'>());
  runtime.intake(timers.events, (fired) => {
    if (timers.take(fired)) runtime.send({ type: 'timer' });
  });

  runtime.send({ type: 'connect' });
  await vi.waitFor(() => expect(opened[0]?.state.listening).toBe(true));
  opened[0]!.drop();
  await vi.waitFor(() =>
    expect(runtime.state).toEqual({ status: 'waiting', attempt: 1 }),
  );

  await vi.advanceTimersByTimeAsync(backoffMs(1));
  expect(runtime.state).toEqual({ status: 'connecting', attempt: 1 });
  await vi.waitFor(() => expect(opened[1]?.state.listening).toBe(true));
  opened[1]!.open();
  await vi.waitFor(() => expect(runtime.state).toEqual({ status: 'open' }));

  // oxlint-disable-next-line trpc/no-symbol-dispose
  await runtime[Symbol.asyncDispose]();
  expect(opened[1]!.state).toEqual({ closed: true, listening: false });
  vi.useRealTimers();
});
