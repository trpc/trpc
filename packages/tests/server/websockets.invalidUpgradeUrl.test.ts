import net from 'node:net';
import { trpcServerResource } from '@trpc/server/__tests__/trpcServerResource';
import { initTRPC } from '@trpc/server';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import WebSocket from 'ws';

/**
 * Sends a raw WebSocket upgrade and resolves with what the server writes
 * back, once it sends a close frame.
 */
function rawUpgrade(opts: { port: number; target: string; host: string }) {
  return new Promise<string>((resolve, reject) => {
    const socket = net.connect(opts.port, '127.0.0.1');
    let received = '';
    socket.on('data', (chunk) => {
      received += chunk.toString('latin1');
      // close frame: opcode 8, then length 13 (2-byte code + 'Invalid URL')
      if (received.includes('\x88\x0d')) {
        socket.destroy();
        resolve(received);
      }
    });
    socket.on('error', reject);
    socket.write(
      [
        `GET ${opts.target} HTTP/1.1`,
        `Host: ${opts.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'),
    );
  });
}

function connectAndPing(url: string) {
  return new Promise<unknown>((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({ id: 1, method: 'query', params: { path: 'ping' } }),
      );
    });
    ws.on('message', (data) => {
      // oxlint-disable-next-line typescript/no-base-to-string
      resolve(JSON.parse(data.toString()));
      ws.close();
    });
    ws.on('error', reject);
  });
}

describe.each([
  { name: 'unparseable Host', target: '/', host: '[]' },
  { name: 'Host with an empty port', target: '/', host: ':' },
  { name: 'scheme-relative target', target: '//:80', host: 'localhost' },
])('WebSocket upgrade with $name', (upgrade) => {
  test('closes that connection and keeps serving others', async () => {
    const t = initTRPC.create();
    const router = t.router({
      ping: t.procedure.query(() => 'pong'),
    });
    const onError = vi.fn<NonNullable<WSSHandlerOptions<any>['onError']>>();
    const createContext = vi.fn(() => ({}));
    await using server = trpcServerResource(router, {
      wssServer: { onError, createContext },
    });

    // Without the fix, the connection handler throws out of the `ws`
    // 'connection' event and the process exits (vitest reports it as an
    // unhandled error).
    const received = await rawUpgrade({
      port: server.wssPort,
      target: upgrade.target,
      host: upgrade.host,
    });

    expect(received).toContain('101 Switching Protocols');
    // close frame with code 1008 (0x03f0)
    expect(received).toContain('\x88\x0d\x03\xf0Invalid URL');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0].error).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid URL',
    });
    expect(createContext).not.toHaveBeenCalled();

    expect(await connectAndPing(server.wssUrl)).toMatchObject({
      id: 1,
      result: { type: 'data', data: 'pong' },
    });
  });
});
