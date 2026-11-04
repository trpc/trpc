import type { WebSocket as WsWebSocket } from 'ws';
// oxlint-disable-next-line no-restricted-imports
import type {
  MachineTransition,
  StateMachine,
} from '../../unstable-core-do-not-import';
// oxlint-disable-next-line no-restricted-imports
import {
  createMachineRuntime,
  createMachineTimers,
  exhaustive,
  makeResource,
} from '../../unstable-core-do-not-import';

export type KeepAliveState =
  /** Waiting for `pingMs` without a message. */
  | { status: 'listening' }
  /** A ping went out: any message within `pongWaitMs` will do. */
  | { status: 'awaitingPong' }
  /** The connection closed, or was terminated for not answering. */
  | { status: 'stopped' };

export type KeepAliveTimer = 'ping' | 'pong';

export type KeepAliveEvent =
  | { type: 'message' }
  | { type: 'timer'; timer: KeepAliveTimer }
  | { type: 'closed' };

export type KeepAliveEffect =
  | { type: 'startTimer'; timer: KeepAliveTimer; ms: number }
  | { type: 'cancelTimer'; timer: KeepAliveTimer }
  | { type: 'sendPing' }
  | { type: 'terminate' };

type KeepAliveTransition = MachineTransition<KeepAliveState, KeepAliveEffect>;

/**
 * Pings a client after `pingMs` without a message, and terminates the
 * connection if no message comes within `pongWaitMs` of the ping.
 */
export function keepAliveMachine(opts: {
  pingMs: number;
  pongWaitMs: number;
}): StateMachine<KeepAliveState, KeepAliveEvent, KeepAliveEffect> {
  const listening: KeepAliveTransition = {
    state: { status: 'listening' },
    effects: [{ type: 'startTimer', timer: 'ping', ms: opts.pingMs }],
  };
  const stopped: KeepAliveState = { status: 'stopped' };

  function transition(
    state: KeepAliveState,
    event: KeepAliveEvent,
  ): KeepAliveTransition {
    const stay: KeepAliveTransition = { state, effects: [] };
    switch (state.status) {
      case 'listening':
        switch (event.type) {
          case 'message':
            return listening;
          case 'timer':
            if (event.timer === 'pong') {
              return stay;
            }
            return {
              state: { status: 'awaitingPong' },
              effects: [
                { type: 'sendPing' },
                { type: 'startTimer', timer: 'pong', ms: opts.pongWaitMs },
              ],
            };
          case 'closed':
            return {
              state: stopped,
              effects: [{ type: 'cancelTimer', timer: 'ping' }],
            };
          default:
            return exhaustive(event, stay);
        }
      case 'awaitingPong':
        switch (event.type) {
          case 'message':
            return {
              state: listening.state,
              effects: [
                { type: 'cancelTimer', timer: 'pong' },
                ...listening.effects,
              ],
            };
          case 'timer':
            if (event.timer === 'ping') {
              return stay;
            }
            return { state: stopped, effects: [{ type: 'terminate' }] };
          case 'closed':
            return {
              state: stopped,
              effects: [{ type: 'cancelTimer', timer: 'pong' }],
            };
          default:
            return exhaustive(event, stay);
        }
      case 'stopped':
        return stay;
      default:
        return exhaustive(state, stay);
    }
  }

  return { initial: listening, transition };
}

/**
 * Runs {@link keepAliveMachine} on `client` until it's disposed. A message
 * of any kind counts as an answer.
 */
export function keepAliveResource(
  client: WsWebSocket,
  opts: {
    pingMs: number;
    pongWaitMs: number;
    /** Gets what an effect throws, such as a ping that can't be sent. */
    onError: (cause: unknown) => void;
  },
) {
  const timers = createMachineTimers<KeepAliveTimer>();
  const runtime = createMachineRuntime({
    machine: keepAliveMachine(opts),
    run(effect) {
      switch (effect.type) {
        case 'startTimer':
          timers.start(effect.timer, effect.ms);
          return;
        case 'cancelTimer':
          timers.cancel(effect.timer);
          return;
        case 'sendPing':
          client.send('PING');
          return;
        case 'terminate':
          client.terminate();
          return;
        default:
          exhaustive(effect, undefined);
      }
    },
    onError: opts.onError,
  });
  runtime.use(timers);
  runtime.intake(timers.events, (fired) => {
    // a timer restarted since it went off doesn't count
    if (timers.take(fired)) {
      runtime.send({ type: 'timer', timer: fired.timer });
    }
  });
  const onMessage = () => runtime.send({ type: 'message' });
  const onClose = () => runtime.send({ type: 'closed' });
  client.on('message', onMessage);
  client.once('close', onClose);
  runtime.use(
    makeResource({}, () => {
      client.off('message', onMessage);
      client.off('close', onClose);
    }),
  );
  return runtime;
}
