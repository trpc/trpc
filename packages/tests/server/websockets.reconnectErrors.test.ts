import { createServer } from 'node:net';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { TRPCClientError, WebSocketClientOptions } from '@trpc/client';
import { createWSClient } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import { initTRPC } from '@trpc/server';
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
});
