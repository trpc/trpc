import { MessageChannel } from 'node:worker_threads';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import type { ClientMessage, ServerMessage } from '../../internal/protocol.ts';

const t = initTrpc();
const makeHandler = () =>
  createFetchHandler({
    router: t.router({ hello: t.procedure.query(() => 'hi') }),
  });

const request: ClientMessage = {
  id: 1,
  type: 'request',
  method: 'query',
  path: 'hello',
};
const result: ServerMessage = { id: 1, type: 'result', body: { json: 'hi' } };

/**
 * A Web-style port. Like a started port, it drops a message that arrives
 * while it has no `message` listener.
 */
function webPort() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  const sent: unknown[] = [];
  return {
    sent,
    postMessage: (message: unknown) => {
      sent.push(message);
    },
    addEventListener: (type: string, listener: (event: any) => void) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: (event: any) => void) => {
      listeners.get(type)?.delete(listener);
    },
    /** Dispatches `type` as if the other end had caused it. */
    emit: (type: string, event: unknown) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    count: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}

test('a session removes its Web-style listeners when the port closes, and hears a message sent right away', async () => {
  const handler = makeHandler();
  const port = webPort();
  handler.messagePort(port);
  port.emit('message', { data: request });
  expect(port.count()).toBe(2);
  await vi.waitFor(() => expect(port.sent).toContainEqual(result));

  port.emit('close', {});
  await vi.waitFor(() => expect(port.count()).toBe(0));
  await handler.dispose();
});

test('dispose() removes the listeners of a Node port', async () => {
  const handler = makeHandler();
  const { port1, port2 } = new MessageChannel();
  handler.messagePort(port1);
  expect(port1.listenerCount('message')).toBe(1);
  expect(port1.listenerCount('close')).toBe(1);
  const reply = new Promise((resolve) => port2.once('message', resolve));
  port2.postMessage(request);
  expect(await reply).toEqual(result);

  await handler.dispose();
  expect(port1.listenerCount('message')).toBe(0);
  expect(port1.listenerCount('close')).toBe(0);
  port1.close();
  port2.close();
});

test('a Node port that closes loses the listeners its session added', async () => {
  const handler = makeHandler();
  const channel = new MessageChannel();
  handler.messagePort(channel.port1);
  channel.port2.close();
  await vi.waitFor(() =>
    expect(channel.port1.listenerCount('message')).toBe(0),
  );
  expect(channel.port1.listenerCount('close')).toBe(0);
  await handler.dispose();
});

test('a port without `off` keeps working, and keeps its listeners', async () => {
  const handler = makeHandler();
  const listeners = new Map<string, (value: unknown) => void>();
  const sent: unknown[] = [];
  handler.messagePort({
    postMessage: (message) => {
      sent.push(message);
    },
    on: (event, listener) => listeners.set(event, listener),
  });
  listeners.get('message')!(request);
  await vi.waitFor(() => expect(sent).toEqual([result]));

  await handler.dispose();
  expect([...listeners.keys()]).toEqual(['message', 'close']);
});
