import {
  createTrpcClient,
  routerType,
  safe,
  wsLink,
} from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

const t = initTrpc();
const router = {
  hello: t.procedure.query(() => 'hello'),
  ticks: t.procedure.subscription(async function* () {
    yield 0;
  }),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Sent {
  id: number;
  type: string;
  path?: string;
}

/** A WebSocket whose server side is the test: it sees what the link sends and delivers any frame. */
class ScriptedWebSocket extends EventTarget {
  static opened: ScriptedWebSocket[] = [];
  readyState = 0;
  binaryType = 'blob';
  readonly sent: Sent[] = [];
  constructor(_url: string | URL) {
    super();
    ScriptedWebSocket.opened.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  receive(data: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', {
        data:
          typeof data === 'object' &&
          !(data instanceof ArrayBuffer) &&
          !(data instanceof Blob)
            ? JSON.stringify(data)
            : data,
      }),
    );
  }
  async request(path: string): Promise<Sent> {
    for (;;) {
      const found = this.sent.find(
        (m) => m.type === 'request' && m.path === path,
      );
      if (found) return found;
      await sleep(1);
    }
  }
}

const connect = (opts: Partial<Parameters<typeof wsLink>[0]> = {}) => {
  ScriptedWebSocket.opened = [];
  const link = wsLink({
    url: 'ws://scripted',
    WebSocket: ScriptedWebSocket as unknown as typeof WebSocket,
    keepAlive: false,
    ...opts,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const socket = async (i = 0) => {
    while (!ScriptedWebSocket.opened[i]) await sleep(1);
    return ScriptedWebSocket.opened[i];
  };
  return { link, client, socket };
};

test('frames the link cannot read are skipped; answers for other ids are ignored', async () => {
  const connection = connect();
  const hello = connection.client.hello.query();
  const ws = await connection.socket();
  const response = await ws.request('hello');
  ws.receive(new Uint8Array([9, 9, 9]).buffer);
  ws.receive(new Blob(['{}']));
  ws.receive('not json');
  ws.receive({ id: response.id + 1, type: 'result', body: { json: 'other' } });
  ws.receive({ id: response.id, type: 'result', body: { json: 'hello' } });
  expect(await hello).toBe('hello');
  await connection.link.close();
});

test('an error body the serializer cannot read fails the calls as a parse error', async () => {
  const connection = connect();
  const hello = safe(connection.client.hello.query());
  const ws = await connection.socket();
  await ws.request('hello');
  ws.receive({ id: null, type: 'error', body: null });
  expect((await hello).error).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'Invalid error message',
  });
  await connection.link.close();
});

test('a subscription that heard nothing reconnects after the default delay; stray chunks are ignored', async () => {
  const connection = connect({ reconnect: { attempts: 1 } });
  const events: unknown[] = [];
  const done = (async () => {
    for await (const value of connection.client.ticks.subscribe())
      events.push(value);
  })();
  const first = await connection.socket(0);
  await first.request('ticks');
  const started = Date.now();
  first.close();
  const second = await connection.socket(1);
  expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  const { id } = await second.request('ticks');
  second.receive({ id, type: 'chunk', chunk: [0, 0, { json: 1 }] });
  second.receive({ id, type: 'event', body: { json: 7 } });
  second.receive({ id, type: 'done' });
  await done;
  expect(events).toEqual([7]);
  await connection.link.close();
});

test('an abort after the socket started closing is not sent', async () => {
  const connection = connect({ reconnect: { attempts: 0 } });
  const controller = new AbortController();
  const hello = safe(
    connection.client.hello.query(undefined, { signal: controller.signal }),
  );
  const ws = await connection.socket();
  await ws.request('hello');
  ws.readyState = 2;
  controller.abort();
  await hello;
  expect(ws.sent.map((m) => m.type)).toEqual(['init', 'request']);
  await connection.link.close();
});
