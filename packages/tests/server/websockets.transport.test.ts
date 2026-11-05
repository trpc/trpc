import { jsonEncoder } from '@trpc/client/links/wsLink/wsClient/encoder';
import { openTransport } from '@trpc/client/links/wsLink/wsClient/transport';

class FakeSocket extends EventTarget {
  static latest: FakeSocket | null = null;
  readyState = 0;
  binaryType = 'blob';
  readonly sent: unknown[] = [];
  constructor(readonly url: string) {
    super();
    FakeSocket.latest = this;
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(data: string) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

test('each PONG answers its own PING, so a keepAlive PONG never ends a fence', async () => {
  vi.useFakeTimers();
  using transport = openTransport({
    id: 1,
    WebSocketPonyfill: FakeSocket as unknown as typeof WebSocket,
    urlOptions: { url: 'ws://localhost' },
    keepAlive: { enabled: true, intervalMs: 1_000, pongTimeoutMs: 5_000 },
    encoder: jsonEncoder,
  });
  const events = transport.events[Symbol.asyncIterator]();
  try {
    const opened = events.next();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeSocket.latest;
    assert(socket);
    socket.open();
    expect((await opened).value).toEqual({ type: 'socketOpened' });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.sent).toEqual(['PING']);
    transport.fence({ request: 1, to: 2 });
    expect(socket.sent).toEqual(['PING', 'PING']);

    socket.receive('PONG');
    expect((await events.next()).value).toEqual({ type: 'heartbeat' });
    socket.receive('PONG');
    expect((await events.next()).value).toEqual({
      type: 'fenced',
      fence: { request: 1, to: 2 },
    });
    socket.receive('PONG');
    expect((await events.next()).value).toEqual({ type: 'heartbeat' });

    // Nothing is sent, so nothing waits for its answer.
    socket.readyState = 2;
    transport.fence({ request: 3, to: 2 });
    expect(socket.sent).toEqual(['PING', 'PING']);
  } finally {
    await events.return?.();
    vi.useRealTimers();
  }
});
