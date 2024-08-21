import { createTRPCClient, httpBatchLink } from '@trpc/client';

globalThis.fetch = vi.fn() as any;

describe('typedefs on createClient', () => {
  test('ok to pass only links', () => {
    createTRPCClient({
      links: [httpBatchLink({ url: 'foo' })],
    });
  });

  test('error if both url and links are passed', () => {
    createTRPCClient({
      links: [httpBatchLink({ url: 'foo' })],
      // @ts-expect-error - can't pass url along with links
      url: 'foo',
    });
  });
});
