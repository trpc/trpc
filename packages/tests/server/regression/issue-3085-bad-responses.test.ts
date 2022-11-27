import '../___packages';
import { waitError } from '../___testHelpers';
import { TRPCClientError, createTRPCProxyClient, httpLink } from '@trpc/client';
import { observable, observableToPromise } from '@trpc/server/observable';
import http from 'http';
import fetch from 'node-fetch';
import superjson from 'superjson';

type Handler = (opts: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
}) => void;

function createServer(handler: Handler) {
  const server = http.createServer((req, res) => handler({ req, res }));
  server.listen(0);

  const port = (server.address() as any).port as number;

  return {
    url: `http://localhost:${port}`,
    close: () => server.close(),
  };
}

test('badly formatted response', async () => {
  const server = createServer(({ res }) => {
    res.setHeader('content-type', 'application/json');
    res.write(JSON.stringify({}));
    res.end();
  });
  const client: any = createTRPCProxyClient({
    links: [
      httpLink({
        url: server.url,
        fetch: fetch as any,
      }),
    ],
  });

  const error = await waitError(client.test.query(), TRPCClientError);
  expect(error).toMatchInlineSnapshot(
    `[TRPCClientError: Badly formatted response from server]`,
  );

  server.close();
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
  const client: any = createTRPCProxyClient({
    links: [
      httpLink({
        url: server.url,
        fetch: fetch as any,
      }),
    ],
    transformer: superjson,
  });

  const error = await waitError(client.test.query(), TRPCClientError);
  expect(error).toMatchInlineSnapshot(
    `[TRPCClientError: Cannot read properties of undefined (reading 'json')]`,
  );

  server.close();
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
  const client: any = createTRPCProxyClient({
    links: [
      httpLink({
        url: server.url,
        fetch: fetch as any,
      }),
    ],
    transformer: superjson,
  });

  const error = await waitError(client.test.query(), TRPCClientError);
  expect(error).toMatchInlineSnapshot(
    `[TRPCClientError: Cannot read properties of undefined (reading 'json')]`,
  );

  server.close();
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
  const client: any = createTRPCProxyClient({
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

  server.close();
});
