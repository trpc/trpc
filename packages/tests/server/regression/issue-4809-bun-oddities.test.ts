import '../___packages';
import { createTRPCProxyClient, httpBatchLink, loggerLink } from '@trpc/client';

test('woot', async () => {
  const _client = createTRPCProxyClient({
    links: [
      loggerLink({
        enabled: (opts) => {
          return true;
        },
      }),
      httpBatchLink({
        url: `http://127.0.0.1:8080/trpc`,
      }),
    ],
  });

  const client = _client as any;

  const result = await client.greeting.query({ name: 'ok ' });
  expect(result).toMatchInlineSnapshot(`
    Object {
      "message": "Greetings ok , from the tRPC server!",
    }
  `);
});
