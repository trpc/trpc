import { waitError } from './___testHelpers';
import {
  TRPCClientError,
  createTRPCClient,
  createTRPCClientProxy,
  httpLink,
} from '@trpc/client';
import http from 'http';
import { konn } from 'konn';
import { initTRPC } from '../src';

describe('faulty HTTP response', () => {
  const t = initTRPC()();
  const appRouter = t.router({
    q: t.procedure.query(() => {
      return 'this is never actualy called';
    }),
  });

  const ctx = konn()
    .beforeEach(() => {
      const server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            message: 'Bad formatted',
          }),
        );
      });
      server.listen(0);
      const port = (server.address() as any).port as number;

      const client = createTRPCClient<typeof appRouter>({
        links: [
          httpLink({
            url: `http://localhost:${port}`,
          }),
        ],
      });
      const proxy = createTRPCClientProxy(client);

      return {
        close: () => server.close(),
        proxy,
      };
    })
    .afterEach(async (ctx) => {
      ctx?.close?.();
    })
    .done();

  test('httpLink failure', async () => {
    const error = (await waitError(
      ctx.proxy.q.query(),
      TRPCClientError,
    )) as any as TRPCClientError<typeof appRouter>;

    expect(error).toMatchInlineSnapshot();
  });
});
