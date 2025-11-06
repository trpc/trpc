import { createTRPCClient, httpBatchLink } from '@trpc/client';

globalThis.fetch = vi.fn() as any;

describe('typedefs on createClient', () => {
  test('ok to pass only links', () => {
    createTRPCClient({
      links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
    });
  });

  test('error if both url and links are passed', () => {
    createTRPCClient({
      links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
      // @ts-expect-error - can't pass url along with links
      url: 'http://localhost:3000/trpc',
    });
  });
});
