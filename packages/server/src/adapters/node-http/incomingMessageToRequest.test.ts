import * as http from 'http';
import { expect } from 'vitest';
import { incomingMessageToRequest } from './incomingMessageToRequest';

function createServer(opts: Parameters<typeof incomingMessageToRequest>[1]) {
  type Handler = (req: Request) => Promise<void>;

  let rejectHandler: null | ((err: any) => void) = null;
  let resolveHandler: null | (() => void) = null;
  let handle: Handler | null = null;
  const server = http.createServer(async (req, res) => {
    const request = incomingMessageToRequest(req, opts);

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
