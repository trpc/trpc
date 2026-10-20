import { Effect, Fiber } from 'effect';
import { expect, test } from 'vite-plus/test';
import { runWebSocketLike } from './socket-session.ts';
import type { WebSocketLike } from './socket.ts';

class PlainSocket extends EventTarget implements WebSocketLike {
  readonly closes: Array<[number | undefined, string | undefined]> = [];
  readyState: number;
  constructor(readyState: number) {
    super();
    this.readyState = readyState;
  }
  send() {}
  close(code?: number, reason?: string) {
    this.closes.push([code, reason]);
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
}

const interruptSession = (ws: WebSocketLike) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        runWebSocketLike(ws, () => Effect.never),
        { startImmediately: true },
      );
      yield* Fiber.interrupt(fiber);
    }),
  );

test("interrupting an open socket's session closes it with 1012", async () => {
  const ws = new PlainSocket(1);
  await interruptSession(ws);
  expect(ws.closes).toEqual([[1012, 'Service restart']]);
});

test('a socket still connecting is closed with 1012 once it opens, not before', async () => {
  const ws = new PlainSocket(0);
  await interruptSession(ws);
  expect(ws.closes).toEqual([]);
  ws.open();
  ws.open();
  expect(ws.closes).toEqual([[1012, 'Service restart']]);
});

test('a socket already closing is left alone', async () => {
  const ws = new PlainSocket(2);
  await interruptSession(ws);
  expect(ws.closes).toEqual([]);
});

test('a session that ends by itself leaves its socket as it is', async () => {
  const ws = new PlainSocket(1);
  await Effect.runPromise(runWebSocketLike(ws, () => Effect.void));
  expect(ws.closes).toEqual([]);
});
