import http from 'http';
import { waitError } from '../___testHelpers';
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  TRPCClientError,
} from '@trpc/client';
import fetch from 'node-fetch';

type Handler = (opts: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
}) => void;

function createServer(handler: Handler) {
  const server = http.createServer((req, res) => {
    handler({ req, res });
  });
  server.listen(0);

  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected address to be AddressInfo');
  const port = address.port;

  return {
    url: `http://localhost:${port}`,
    async close() {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    },
  };
}

describe('server responds with 413 Payload Too Large', () => {
  test('httpLink', async () => {
    const server = createServer(({ res }) => {
      res.setHeader('content-type', 'application/json');
      res.statusCode = 413;
      res.statusMessage = 'Payload Too Large';
      res.write(
        JSON.stringify({
          statusCode: 413,
          code: 'FST_ERR_CTP_BODY_TOO_LARGE',
          error: 'Payload Too Large',
          message: 'Request body is too large',
        }),
      );
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
      '[TRPCClientError: Unable to transform response from server]',
    );
    expect(error.message).toMatchInlineSnapshot(
      '"Unable to transform response from server"',
    );

    await server.close();
  });

  test('batchLink', async () => {
    const server = createServer(({ res }) => {
      res.setHeader('content-type', 'application/json');
      res.statusCode = 413;
      res.statusMessage = 'Payload Too Large';
      res.write(
        JSON.stringify({
          statusCode: 413,
          code: 'FST_ERR_CTP_BODY_TOO_LARGE',
          error: 'Payload Too Large',
          message: 'Request body is too large',
        }),
      );
      res.end();
    });

    const client: any = createTRPCClient({
      links: [
        httpBatchLink({
          url: server.url,
          fetch: fetch as any,
        }),
      ],
    });

    const error = await waitError(client.test.query(), TRPCClientError);
    expect(error).toMatchInlineSnapshot(
      '[TRPCClientError: Unable to transform response from server]',
    );
    expect(error.message).toMatchInlineSnapshot(
      '"Unable to transform response from server"',
    );

    await server.close();
  });
});
