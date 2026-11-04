import { createServer } from 'node:net';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { TRPCClientError, WebSocketClientOptions } from '@trpc/client';
import { createWSClient } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import { initTRPC } from '@trpc/server';
import type { Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import { makeResource, sleep } from '@trpc/server/unstable-core-do-not-import';

function createRouter() {
  const t = initTRPC.create();
  return t.router({
    onTick: t.procedure.subscription(() =>
      observable<number>((emit) => {
        emit.next(1);
        return () => null;
      }),
    ),
  });
}

function captureUncaught() {
  const uncaught: unknown[] = [];
  const onUncaught = (cause: unknown) => uncaught.push(cause);
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUncaught);
  return makeResource({ uncaught }, () => {
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onUncaught);
  });
}

async function getUnusedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

type ConnectionState = TRPCConnectionState<TRPCClientError<any>>;

function causeOf(state: ConnectionState) {
  return state.error?.cause?.cause;
}

function disposable<TSubscription extends Unsubscribable>(
  subscription: TSubscription,
) {
  return makeResource(subscription, () => subscription.unsubscribe());
}

describe('connectionParams errors', () => {
  test('initial connect: the error is surfaced on the connection state', async () => {
    const paramsError = new Error('connectionParams failed');
    let fail = true;
    await using ctx = testServerAndClientResource(createRouter(), {
      wsClient: {
        retryDelayMs: () => 10,
        connectionParams: () => {
          if (fail) throw paramsError;
          return {};
        },
      },
      clientLink: 'wsLink',
    });

    const states: ConnectionState[] = [];
    const onData = vi.fn();
    const onError = vi.fn();
    const sub = ctx.client.onTick.subscribe(undefined, {
      onData,
      onError,
      onConnectionStateChange: (state) => states.push(state),
    });

    await vi.waitFor(() => {
      expect(states.map(causeOf)).toContain(paramsError);
    });
    const errorState = states.find((state) => causeOf(state) === paramsError)!;
    expect(errorState.state).toBe('connecting');
    expect(errorState.error?.message).toBe('Initialization error');

    fail = false;
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledWith(1);
    });
    expect(onError).not.toHaveBeenCalled();
    sub.unsubscribe();
  });

  test('reconnect: the error is surfaced on the connection state and the client keeps retrying', async () => {
    const paramsError = new Error('connectionParams failed');
    let fail = false;
    const connectionParams = vi.fn(() => {
      if (fail) throw paramsError;
      return {};
    });
    await using ctx = testServerAndClientResource(createRouter(), {
      wsClient: {
        retryDelayMs: () => 10,
        connectionParams,
      },
      clientLink: 'wsLink',
    });

    const states: ConnectionState[] = [];
    const onStarted = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();
    const sub = ctx.client.onTick.subscribe(undefined, {
      onStarted,
      onData,
      onError,
      onConnectionStateChange: (state) => states.push(state),
    });
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    fail = true;
    ctx.destroyConnections();

    await vi.waitFor(() => {
      expect(connectionParams.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    await vi.waitFor(() => {
      expect(states.map(causeOf)).toContain(paramsError);
    });
    const errorState = states.find((state) => causeOf(state) === paramsError)!;
    expect(errorState.state).toBe('connecting');
    expect(errorState.error?.message).toBe('Initialization error');

    fail = false;
    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledTimes(2);
    });
    expect(ctx.wsClient.connectionState.get()).toEqual({
      type: 'state',
      state: 'pending',
      error: null,
    });
    expect(onError).not.toHaveBeenCalled();
    sub.unsubscribe();
  });
});

describe('throwing user callbacks', () => {
  test('a throwing onClose does not prevent the reconnect, and its error is not swallowed', async () => {
    using g = captureUncaught();
    const onCloseError = new Error('onClose failed');
    const onClose = vi.fn().mockImplementationOnce(() => {
      throw onCloseError;
    });
    await using ctx = testServerAndClientResource(createRouter(), {
      wsClient: {
        retryDelayMs: () => 10,
        onClose,
      },
      clientLink: 'wsLink',
    });

    const onStarted = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();
    const sub = ctx.client.onTick.subscribe(undefined, {
      onStarted,
      onData,
      onError,
    });
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    ctx.destroyConnections();

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(g.uncaught).toEqual([onCloseError]);
    });
    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledTimes(2);
    });
    expect(ctx.wsClient.connectionState.get().state).toBe('pending');
    expect(onError).not.toHaveBeenCalled();
    sub.unsubscribe();
  });

  test('a throwing onError does not prevent the reconnect, and its error is not swallowed', async () => {
    using g = captureUncaught();
    const onErrorError = new Error('onError failed');
    let throwing = true;
    const onError = vi.fn<NonNullable<WebSocketClientOptions['onError']>>(
      () => {
        if (throwing) throw onErrorError;
      },
    );
    const retryDelayMs = vi.fn(() => 10);
    const wsClient = createWSClient({
      url: `ws://localhost:${await getUnusedPort()}`,
      retryDelayMs,
      onError,
    });

    try {
      await vi.waitFor(() => {
        expect(onError.mock.calls.length).toBeGreaterThanOrEqual(3);
        expect(g.uncaught.length).toBeGreaterThanOrEqual(3);
      });
      expect(retryDelayMs.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(new Set(g.uncaught)).toEqual(new Set([onErrorError]));
      throwing = false;
      await wsClient.close();
      await sleep(10);
    } finally {
      throwing = false;
      // on failure, `close()` may never settle; don't let it time out the test
      void wsClient.close();
    }
  });

  test('an onConnectionStateChange that throws on the reconnect error does not stop the retries, and its error is not swallowed', async () => {
    using g = captureUncaught();
    const paramsError = new Error('connectionParams failed');
    const stateError = new Error('onConnectionStateChange failed');
    let fail = false;
    const connectionParams = vi.fn(() => {
      if (fail) throw paramsError;
      return {};
    });
    await using ctx = testServerAndClientResource(createRouter(), {
      wsClient: {
        retryDelayMs: () => 10,
        connectionParams,
      },
      clientLink: 'wsLink',
    });

    const onStarted = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();
    const onConnectionStateChange = vi.fn((state: ConnectionState) => {
      if (causeOf(state) === paramsError) throw stateError;
    });
    const sub = ctx.client.onTick.subscribe(undefined, {
      onStarted,
      onData,
      onError,
      onConnectionStateChange,
    });
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    fail = true;
    ctx.destroyConnections();

    await vi.waitFor(() => {
      expect(g.uncaught).toContain(stateError);
    });

    fail = false;
    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledTimes(2);
    });
    expect(ctx.wsClient.connectionState.get()).toEqual({
      type: 'state',
      state: 'pending',
      error: null,
    });
    expect(new Set(g.uncaught)).toEqual(new Set([stateError]));
    expect(onError).not.toHaveBeenCalled();
    sub.unsubscribe();
  });

  test('an onConnectionStateChange that throws on every state change does not stop the reconnect', async () => {
    using g = captureUncaught();
    const paramsError = new Error('connectionParams failed');
    const stateError = new Error('onConnectionStateChange failed');
    let fail = false;
    let throwing = false;
    let thrown = 0;
    await using ctx = testServerAndClientResource(createRouter(), {
      wsClient: {
        retryDelayMs: () => 10,
        connectionParams: () => {
          if (fail) throw paramsError;
          return {};
        },
      },
      clientLink: 'wsLink',
    });

    const onStarted = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();
    const states: ConnectionState[] = [];
    const sub = ctx.client.onTick.subscribe(undefined, {
      onStarted,
      onData,
      onError,
      onConnectionStateChange: (state) => {
        states.push(state);
        if (throwing) {
          thrown++;
          throw stateError;
        }
      },
    });
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    throwing = true;
    fail = true;
    ctx.destroyConnections();

    await vi.waitFor(() => {
      expect(states.map(causeOf)).toContain(paramsError);
    });

    fail = false;
    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledTimes(2);
    });
    expect(states.at(-1)).toEqual({
      type: 'state',
      state: 'pending',
      error: null,
    });
    throwing = false;
    await vi.waitFor(() => {
      expect(g.uncaught).toHaveLength(thrown);
    });
    expect(new Set(g.uncaught)).toEqual(new Set([stateError]));
    expect(onError).not.toHaveBeenCalled();
    sub.unsubscribe();
  });
});

describe('onConnectionStateChange throwing on the first state', () => {
  test.each([
    { mode: 'lazy', lazy: true, firstState: 'idle' },
    { mode: 'eager', lazy: false, firstState: 'connecting' },
  ] as const)(
    '$mode: the subscription still starts and the error is not swallowed',
    async ({ lazy, firstState }) => {
      using g = captureUncaught();
      const stateError = new Error('onConnectionStateChange failed');
      await using ctx = testServerAndClientResource(createRouter(), {
        wsClient: {
          lazy: { enabled: lazy, closeMs: 0 },
        },
        clientLink: 'wsLink',
      });

      const states: ConnectionState['state'][] = [];
      const onConnectionStateChange = vi.fn((state: ConnectionState) => {
        states.push(state.state);
        if (states.length === 1) throw stateError;
      });
      const onStarted = vi.fn();
      const onData = vi.fn();
      const onError = vi.fn();
      const syncThrows: unknown[] = [];
      let sub: { unsubscribe: () => void } | undefined;
      try {
        sub = ctx.client.onTick.subscribe(undefined, {
          onStarted,
          onData,
          onError,
          onConnectionStateChange,
        });
      } catch (cause) {
        syncThrows.push(cause);
      }

      await vi.waitFor(() => {
        expect(ctx.wsClient.connectionState.get()).toEqual({
          type: 'state',
          state: 'pending',
          error: null,
        });
        expect(onStarted).toHaveBeenCalledTimes(1);
        expect(onData).toHaveBeenCalledWith(1);
      });
      expect(syncThrows).toEqual([]);
      expect(states[0]).toBe(firstState);
      expect(states.at(-1)).toBe('pending');
      await vi.waitFor(() => {
        expect(g.uncaught).toEqual([stateError]);
      });
      await sleep(10);
      expect(g.uncaught).toEqual([stateError]);
      expect(onConnectionStateChange.mock.results[0]).toEqual({
        type: 'throw',
        value: stateError,
      });
      expect(onError).not.toHaveBeenCalled();
      sub?.unsubscribe();
    },
  );
});

describe('a throwing connection state subscriber does not stop the others', () => {
  test('two wsLink subscriptions: the second still gets every state', async () => {
    using g = captureUncaught();
    const stateError = new Error('onConnectionStateChange failed');
    await using ctx = testServerAndClientResource(createRouter(), {
      wsClient: {
        retryDelayMs: () => 10,
      },
      clientLink: 'wsLink',
    });

    let thrown = 0;
    const firstStates: ConnectionState[] = [];
    const first = { onStarted: vi.fn(), onData: vi.fn(), onError: vi.fn() };
    using _firstSub = disposable(
      ctx.client.onTick.subscribe(undefined, {
        ...first,
        onConnectionStateChange: (state) => {
          firstStates.push(state);
          if (firstStates.length > 1) {
            thrown++;
            throw stateError;
          }
        },
      }),
    );
    const secondStates: ConnectionState[] = [];
    const second = { onStarted: vi.fn(), onData: vi.fn(), onError: vi.fn() };
    using _secondSub = disposable(
      ctx.client.onTick.subscribe(undefined, {
        ...second,
        onConnectionStateChange: (state) => secondStates.push(state),
      }),
    );

    await vi.waitFor(() => {
      expect(first.onData).toHaveBeenCalledTimes(1);
      expect(second.onData).toHaveBeenCalledTimes(1);
    });
    expect(secondStates.map((state) => state.state)).toEqual([
      'connecting',
      'pending',
    ]);

    ctx.destroyConnections();

    await vi.waitFor(() => {
      expect(first.onStarted).toHaveBeenCalledTimes(2);
      expect(second.onStarted).toHaveBeenCalledTimes(2);
      expect(second.onData).toHaveBeenCalledTimes(2);
    });
    expect(secondStates.map((state) => state.state)).toEqual([
      'connecting',
      'pending',
      'connecting',
      'pending',
    ]);
    expect(secondStates).toEqual(firstStates.slice(1));
    expect(thrown).toBe(4);
    await vi.waitFor(() => {
      expect(g.uncaught).toHaveLength(thrown);
    });
    expect(new Set(g.uncaught)).toEqual(new Set([stateError]));
    expect(first.onError).not.toHaveBeenCalled();
    expect(second.onError).not.toHaveBeenCalled();
  });

  test('two wsClient.connectionState subscribers: the second still gets every state', async () => {
    using g = captureUncaught();
    const stateError = new Error('connectionState subscriber failed');
    await using ctx = testServerAndClientResource(createRouter(), {
      wsClient: {
        retryDelayMs: () => 10,
      },
      clientLink: 'wsLink',
    });

    let thrown = 0;
    const firstStates: ConnectionState[] = [];
    using _firstStateSub = disposable(
      ctx.wsClient.connectionState.subscribe({
        next(state) {
          firstStates.push(state);
          if (firstStates.length > 1) {
            thrown++;
            throw stateError;
          }
        },
      }),
    );
    const secondStates: ConnectionState[] = [];
    using _secondStateSub = disposable(
      ctx.wsClient.connectionState.subscribe({
        next(state) {
          secondStates.push(state);
        },
      }),
    );

    const onStarted = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();
    using _sub = disposable(
      ctx.client.onTick.subscribe(undefined, {
        onStarted,
        onData,
        onError,
      }),
    );
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });
    expect(secondStates.map((state) => state.state)).toEqual([
      'idle',
      'connecting',
      'pending',
    ]);

    ctx.destroyConnections();

    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(2);
      expect(onData).toHaveBeenCalledTimes(2);
    });
    expect(secondStates.map((state) => state.state)).toEqual([
      'idle',
      'connecting',
      'pending',
      'connecting',
      'pending',
    ]);
    expect(secondStates).toEqual(firstStates);
    expect(thrown).toBe(4);
    await vi.waitFor(() => {
      expect(g.uncaught).toHaveLength(thrown);
    });
    expect(new Set(g.uncaught)).toEqual(new Set([stateError]));
    expect(onError).not.toHaveBeenCalled();
  });
});
