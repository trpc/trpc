import { EventEmitter } from 'events';
import * as http from 'http';
import { expect } from 'vitest';
import { incomingMessageToRequest } from './incomingMessageToRequest';

function createServer(opts: Parameters<typeof incomingMessageToRequest>[2]) {
  type Handler = (req: Request) => Promise<void>;

  let rejectHandler: null | ((err: any) => void) = null;
  let resolveHandler: null | (() => void) = null;
  let handle: Handler | null = null;
  const server = http.createServer(async (req, res) => {
    const request = incomingMessageToRequest(req, res, opts);

    await handle!(request).then(resolveHandler).catch(rejectHandler);
    res.end();
  });
  server.listen(0);

  const port = (server.address() as any).port as number;

  return {
    async close() {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    },
    fetch: async (
      opts: RequestInit & {
        path?: string;
      },
      _handle: (request: Request) => Promise<void>,
    ) => {
      handle = _handle;

      const promise = new Promise<void>((resolve, reject) => {
        resolveHandler = resolve;
        rejectHandler = reject;
      });

      await fetch(`http://localhost:${port}${opts.path ?? ''}`, {
        ...opts,
      });
      await promise;
    },
  };
}

function createMockRes() {
  const mockRes = new EventEmitter();
  return mockRes as http.ServerResponse;
}

function createMockReq(opts: Partial<http.IncomingMessage> = {}) {
  const mockSocket = new EventEmitter();
  const req = Object.assign(new EventEmitter(), {
    headers: {},
    url: '/test',
    method: 'GET',
    socket: mockSocket,
    ...opts,
  });
  return req as http.IncomingMessage;
}

test('basic GET', async () => {
  const server = createServer({ maxBodySize: null });
  await server.fetch({}, async (request) => {
    expect(request.method).toBe('GET');
  });
  await server.close();
});

test('basic POST', async () => {
  const server = createServer({ maxBodySize: null });

  await server.fetch(
    {
      method: 'POST',
    },
    async (request) => {
      expect(request.method).toBe('POST');
    },
  );

  await server.close();
});

test('POST with body', async () => {
  const server = createServer({ maxBodySize: null });

  {
    // handles small text

    await server.fetch(
      {
        method: 'POST',
        body: JSON.stringify({ hello: 'world' }),
        headers: {
          'content-type': 'application/json',
        },
      },
      async (request) => {
        expect(request.method).toBe('POST');
        expect(await request.json()).toEqual({ hello: 'world' });
      },
    );
  }
  {
    // handles a body that is long enough to come in multiple chunks

    const body = '0'.repeat(2 ** 17);
    const bodyLength = body.length;

    await server.fetch(
      {
        method: 'POST',
        body,
      },
      async (request) => {
        expect(request.method).toBe('POST');
        expect((await request.text()).length).toBe(bodyLength);
      },
    );
  }

  await server.close();
});

test('POST with body and maxBodySize', async () => {
  const server = createServer({ maxBodySize: 10 });
  {
    // exceeds

    await server.fetch(
      {
        method: 'POST',
        body: '0'.repeat(11),
      },
      async (request) => {
        expect(request.method).toBe('POST');
        await expect(request.text()).rejects.toThrowErrorMatchingInlineSnapshot(
          `[TRPCError: PAYLOAD_TOO_LARGE]`,
        );
      },
    );
  }
  {
    // not exceeds
    await server.fetch(
      {
        method: 'POST',
        body: '0'.repeat(9),
      },
      async (request) => {
        expect(request.method).toBe('POST');
        expect(await request.text()).toBe('0'.repeat(9));
      },
    );
  }

  server.close();
});

test('retains url and search params', async () => {
  const server = createServer({ maxBodySize: null });

  await server.fetch(
    {
      method: 'GET',
      path: '/?hello=world',
    },
    async (request) => {
      const url = new URL(request.url);
      expect(url.pathname).toBe('/');
      expect(url.searchParams.get('hello')).toBe('world');
    },
  );

  await server.close();
});

test('uses https scheme when socket is encrypted', async () => {
  const mockReq = createMockReq({
    headers: {
      host: 'example.com',
    },
    url: '/test',
    method: 'GET',
  });
  // @ts-expect-error - test
  mockReq.socket.encrypted = true;

  const request = incomingMessageToRequest(mockReq, createMockRes(), {
    maxBodySize: null,
  });

  expect(request.url).toBe('https://example.com/test');
});

test('http2 - filters out pseudo-headers', async () => {
  const mockReq = createMockReq({
    headers: {
      ':method': 'GET',
      ':path': '/test',
      accept: 'application/json',
      host: 'example.com',
    },
    url: '/test',
    method: 'GET',
  });

  const request = incomingMessageToRequest(mockReq, createMockRes(), {
    maxBodySize: null,
  });

  const allHeaders = Array.from(request.headers.keys());
  expect(allHeaders).not.toContain(':method');
  expect(allHeaders).not.toContain(':path');

  expect(request.headers.get('accept')).toBe('application/json');
  expect(request.url).toBe('http://example.com/test');

  expect(allHeaders).toMatchInlineSnapshot(`
    Array [
      "accept",
      "host",
    ]
  `);
});

test('http2 - falls back to localhost when no host/authority', async () => {
  const mockReq = createMockReq({
    headers: {},
    url: '/test',
    method: 'GET',
  });

  const request = incomingMessageToRequest(mockReq, createMockRes(), {
    maxBodySize: null,
  });

  expect(request.url).toBe('http://localhost/test');
});

test('adapter with pre-parsed body - string', async () => {
  const mockReq = createMockReq({
    headers: {},
    url: '/test',
    method: 'POST',
    // @ts-expect-error - test
    body: 'hello world',
  });

  const request = incomingMessageToRequest(mockReq, createMockRes(), {
    maxBodySize: null,
  });

  const body = await request.text();
  expect(body).toBe('hello world');
});

test('adapter with pre-parsed body - object', async () => {
  const mockReq = createMockReq({
    headers: {},
    url: '/test',
    method: 'POST',
    // @ts-expect-error - test
    body: { hello: 'world' },
  });

  const request = incomingMessageToRequest(mockReq, createMockRes(), {
    maxBodySize: null,
  });

  const body = await request.text();
  expect(body).toBe('{"hello":"world"}');
});

test('adapter with pre-parsed body - undefined', async () => {
  const mockReq = createMockReq({
    headers: {},
    url: '/test',
    method: 'POST',
    // @ts-expect-error - test
    body: undefined,
  });

  const request = incomingMessageToRequest(mockReq, createMockRes(), {
    maxBodySize: null,
  });

  const body = await request.text();
  expect(body).toBe('');
});

// regression test for https://github.com/trpc/trpc/issues/6193
test('aborts request when socket ends', async () => {
  const mockReq = createMockReq({
    method: 'POST',
  });

  const request = incomingMessageToRequest(mockReq, createMockRes(), {
    maxBodySize: null,
  });

  expect(request.signal.aborted).toBe(false);
  mockReq.socket.emit('close');

  expect(request.signal.aborted).toBe(true);
});

test('aborts request when response closes', async () => {
  const mockReq = createMockReq({
    method: 'POST',
  });
  const mockRes = createMockRes();

  const request = incomingMessageToRequest(mockReq, mockRes, {
    maxBodySize: null,
  });

  expect(request.signal.aborted).toBe(false);
  mockRes.emit('close');

  expect(request.signal.aborted).toBe(true);
});
