import type {
  ConnectionEvent,
  ConnectionModel,
} from '@trpc/client/links/wsLink/wsClient/machine/connectionMachine';
import {
  connectionTransition,
  keepsBackingOff,
} from '@trpc/client/links/wsLink/wsClient/machine/connectionMachine';

/**
 * The connection machine on its own. `websockets.clientMachine.test.ts` runs
 * it inside the client machine against random event sequences.
 */

function run(events: ConnectionEvent[]) {
  let connection: ConnectionModel = {
    id: 1,
    retryIndex: null,
    state: { phase: 'connecting' },
  };
  const steps = events.map((event) => {
    const result = connectionTransition(connection, event);
    connection = result.connection;
    return {
      phase: connection.state.phase,
      effects: result.effects.map((effect) => effect.type),
      notices: result.notices.map((notice) => notice.type),
    };
  });
  return { connection, steps };
}

test('a connection moves forward from connecting to closed', () => {
  const { steps } = run([
    { type: 'socketOpened' },
    { type: 'paramsResolved', data: '{}' },
    { type: 'drain' },
    { type: 'received' },
    { type: 'close' },
    { type: 'socketClosed', event: { code: 1000 } as CloseEvent },
  ]);
  expect(steps).toEqual([
    { phase: 'handshaking', effects: ['resolveParams'], notices: ['onOpen'] },
    { phase: 'ready', effects: ['sendParams'], notices: [] },
    { phase: 'draining', effects: [], notices: [] },
    { phase: 'draining', effects: [], notices: [] },
    { phase: 'closed', effects: ['closeSocket'], notices: [] },
    { phase: 'closed', effects: [], notices: ['onClose'] },
  ]);
});

test("a pong timeout reports onClose at once, without waiting for the socket's close", () => {
  const { connection, steps } = run([
    { type: 'socketOpened' },
    { type: 'paramsResolved', data: null },
    { type: 'pongTimeout' },
  ]);
  expect(steps.at(-1)).toEqual({
    phase: 'closed',
    effects: ['closeSocket'],
    notices: ['onClose'],
  });
  expect(connection.state).toEqual({ phase: 'closed', closeReported: true });
});

test('a reconnect keeps backing off after a rejection, or a pong timeout before any answer', () => {
  const pongTimeout: ConnectionEvent = { type: 'pongTimeout' };
  const opened = run([
    { type: 'socketOpened' },
    { type: 'paramsResolved', data: null },
  ]).connection;
  const answered = connectionTransition(opened, { type: 'received' });
  const rejected = connectionTransition(answered.connection, {
    type: 'rejection',
  });

  expect(keepsBackingOff(opened, pongTimeout)).toBe(true);
  expect(keepsBackingOff(answered.connection, pongTimeout)).toBe(false);
  expect(keepsBackingOff(rejected.connection, { type: 'close' })).toBe(true);
  expect(
    keepsBackingOff(
      { id: 1, retryIndex: null, state: { phase: 'draining' } },
      pongTimeout,
    ),
  ).toBe(false);
});
