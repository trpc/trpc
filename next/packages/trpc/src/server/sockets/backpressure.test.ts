import { once } from 'node:events';
import { connect as tcpConnect, type Socket as TcpSocket } from 'node:net';
import type { Duplex } from 'node:stream';
import { Effect } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import type { Socket } from 'effect/socket';
import { createV11Handler } from '@trpc12/trpc/interop';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { backpressure } from '../../internal/effects.ts';
import {
  bufferedAmountOf,
  fromWebSocketLike,
  sendHighWaterMark,
} from './socket-session.ts';
import type { WebSocketLike } from './socket.ts';
import { upgradeTo } from './upgrade.ts';
import { expect, test } from 'vite-plus/test';

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const payload = 'x'.repeat(1024);

/** A subscription that yields 1 KiB strings until `limit`, counting them. */
function counter(limit = 100_000) {
  const state = { yielded: 0, returned: false };
  return {
    state,
    router: t.router({
      big: t.procedure.subscription(async function* () {
        try {
          while (state.yielded < limit) {
            state.yielded++;
            yield payload;
          }
        } finally {
          state.returned = true;
        }
      }),
    }),
  };
}

/** A standard `WebSocket` whose client never reads: `bufferedAmount` only grows until `drain()`. */
class SlowSocket extends EventTarget {
  readyState = 1;
  bufferedAmount = 0;
  sent = 0;
  send(data: string | Uint8Array) {
    this.sent++;
    this.bufferedAmount +=
      typeof data === 'string' ? data.length : data.byteLength;
  }
  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
  }
  receive(message: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: typeof message === 'string' ? message : JSON.stringify(message),
      }),
    );
  }
  drain() {
    this.bufferedAmount = 0;
  }
}

/** Waits for `ready()`, however long a busy machine takes, within the test's own timeout. */
async function until(ready: () => boolean) {
  while (!ready()) await sleep(5);
}

test.each([
  {
    name: 'v12',
    make: (router: ReturnType<typeof counter>['router']) =>
      createFetchHandler({ router }),
    subscribe: (socket: SlowSocket) => {
      socket.receive({ type: 'init', version: '12' });
      socket.receive({
        id: 1,
        type: 'request',
        method: 'subscription',
        path: 'big',
      });
    },
  },
  {
    name: 'v11 interop',
    make: (router: ReturnType<typeof counter>['router']) =>
      createV11Handler({ router }),
    subscribe: (socket: SlowSocket) => {
      socket.receive({
        id: 1,
        method: 'subscription',
        params: { path: 'big' },
      });
    },
  },
])(
  '$name: a subscription pauses while the socket holds more than the high-water mark, and goes on when it drains',
  async (transport) => {
    const big = counter();
    const { state } = big;
    const handler = transport.make(big.router);
    const socket = new SlowSocket();
    handler.websocket(socket as WebSocketLike, {
      request: new Request('http://localhost/trpc'),
    });
    transport.subscribe(socket);

    // The writer stops one message past the mark, and the outbox fills.
    await until(
      () =>
        socket.bufferedAmount > sendHighWaterMark &&
        state.yielded - socket.sent >= backpressure.bufferSize - 1,
    );
    const { sent } = socket;
    await sleep(50);
    // Nothing more reaches the socket while it's full, and the generator
    // stays within the outbox, however long it waits.
    expect(socket.sent).toBe(sent);
    expect(socket.bufferedAmount).toBeLessThan(sendHighWaterMark + 2048);
    expect(state.yielded - sent).toBeLessThanOrEqual(
      backpressure.bufferSize + 2,
    );

    socket.drain();
    await until(() => socket.sent > sent + 50);
    expect(socket.bufferedAmount).toBeLessThan(sendHighWaterMark + 2048);

    socket.close(1000);
    await until(() => state.returned);
    // Two socketfuls and two outboxes at most.
    expect(state.yielded).toBeLessThan(4 * (sent + backpressure.bufferSize));
    await handler.dispose();
  },
);

/** A WebSocket client on a raw TCP socket, so the test can stop reading. */
async function rawWebSocket(wsUrl: string) {
  const url = new URL(wsUrl);
  const socket: TcpSocket = tcpConnect(Number(url.port), url.hostname);
  await once(socket, 'connect');
  socket.write(
    [
      `GET ${url.pathname} HTTP/1.1`,
      `Host: ${url.host}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n'),
  );
  await new Promise<void>((resolve) => {
    let head = '';
    const onData = (chunk: Buffer) => {
      head += chunk.toString('latin1');
      if (!head.includes('\r\n\r\n')) return;
      socket.pause();
      socket.off('data', onData);
      resolve();
    };
    socket.on('data', onData);
  });
  /** A masked text frame (the mask is zeros, so the payload goes as is). */
  const send = (message: unknown) => {
    const body = Buffer.from(JSON.stringify(message));
    const head =
      body.length < 126
        ? Buffer.from([0x81, 0x80 | body.length])
        : Buffer.from([0x81, 0x80 | 126, body.length >> 8, body.length & 255]);
    socket.write(Buffer.concat([head, Buffer.alloc(4), body]));
  };
  return { socket, send };
}

test("over Node's upgrade, a client that stops reading pauses the generator, which returns when the client leaves", async () => {
  const limit = 100_000;
  const big = counter(limit);
  const { state } = big;
  await using server = await createTestServer({ router: big.router });
  let upgraded: Duplex | undefined;
  server.server.on('upgrade', (_req, socket: Duplex) => (upgraded = socket));
  const client = await rawWebSocket(server.wsUrl);
  client.send({ type: 'init', version: '12' });
  client.send({ id: 1, type: 'request', method: 'subscription', path: 'big' });

  // Once the kernel's buffers are full, unsent bytes pile up in Node's.
  await until(() => (upgraded?.writableLength ?? 0) > sendHighWaterMark);
  for (let i = 0; i < 10; i++) {
    // The server writes only while its socket is under the mark.
    expect(upgraded?.writableLength).toBeLessThan(sendHighWaterMark + 2048);
    expect(state.returned).toBe(false);
    await sleep(10);
  }
  // Socket buffers hold a few MB; without backpressure it reads all of it.
  expect(state.yielded).toBeLessThan(limit / 4);

  client.socket.destroy();
  await until(() => state.returned);
  expect(state.yielded).toBeLessThan(limit / 4);
});

test("an upgrade without Node's socket under it, as on Bun, writes without waiting", async () => {
  const plain = Object.assign(new EventTarget(), {
    readyState: 1,
    send: () => {},
    close: () => {},
  });
  const socket = await Effect.runPromise(fromWebSocketLike(plain));
  const request = {
    source: new Request('http://localhost/trpc'),
    upgrade: Effect.succeed(socket),
  } as unknown as HttpServerRequest.HttpServerRequest;
  let served: Socket.Socket | undefined;
  await Effect.runPromise(
    upgradeTo(request, (upgraded) => Effect.sync(() => (served = upgraded))),
  );
  expect(served).toBe(socket);
  expect(bufferedAmountOf(socket)()).toBe(0);
});
