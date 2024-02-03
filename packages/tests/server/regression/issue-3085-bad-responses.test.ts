import http from 'http';
import { waitError } from '../___testHelpers';
import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import fetch from 'node-fetch';
import superjson from 'superjson';

type Handler = (opts: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
}) => void;

function createServer(handler: Handler) {
  const server = http.createServer((req, res) => {
    handler({ req, res });
  });
  server.listen(0);

  const port = (server.address() as any).port as number;

  return {
    url: `http://localhost:${port}`,
    async close() {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    },
  };
}

test('badly formatted response', async () => {
  const server = createServer(({ res }) => {
    res.setHeader('content-type', 'application/json');
    res.write(JSON.stringify({}));
    res.end();
  });
  const client: any = createTRPCClient({
    links: [
      httpLink({
        url: server.url,
        fetch: fetch as any,
      }),
    ],
  });

  const error = await waitError(client.test.query(), TRPCClientError);
  expect(error).toMatchInlineSnapshot(
    `[TRPCClientError: Unable to transform response from server]`,
  );

  await server.close();
});

test('badly formatted superjson response', async () => {
  const server = createServer(({ res }) => {
    res.setHeader('content-type', 'application/json');
    res.write(
      JSON.stringify({
        result: {},
      }),
    );
    res.end();
  });
  const client: any = createTRPCClient({
    links: [
      httpLink({
        url: server.url,
        fetch: fetch as any,
        transformer: superjson,
      }),
    ],
  });

  const error = await waitError(client.test.query(), TRPCClientError);
  expect(error).toMatchInlineSnapshot(
    `[TRPCClientError: Unable to transform response from server]`,
  );

  await server.close();
});

test('badly formatted superjson response', async () => {
  const server = createServer(({ res }) => {
    res.setHeader('content-type', 'application/json');
    res.write(
      JSON.stringify({
        result: {},
      }),
    );
    res.end();
  });
  const client: any = createTRPCClient({
    links: [
      httpLink({
        url: server.url,
        fetch: fetch as any,
        transformer: superjson,
      }),
    ],
  });

  const error = await waitError(client.test.query(), TRPCClientError);
  expect(error).toMatchInlineSnapshot(
    `[TRPCClientError: Unable to transform response from server]`,
  );

  await server.close();
});

test('bad link', async () => {
  const server = createServer(({ res }) => {
    res.setHeader('content-type', 'application/json');
    res.write(
      JSON.stringify({
        result: {},
      }),
    );
    res.end();
  });
  const client: any = createTRPCClient({
    links: [
      () => (opts) => {
        return observable((observer) => {
          opts.next(opts.op).subscribe({
            ...observer,
            next() {
              throw new Error('whoops');
            },
          });
        });
      },
      httpLink({
        url: server.url,
        fetch: fetch as any,
      }),
    ],
  });

  const error = await waitError(client.test.query(), TRPCClientError);
  expect(error).toMatchInlineSnapshot(`[TRPCClientError: whoops]`);

  await server.close();
});
