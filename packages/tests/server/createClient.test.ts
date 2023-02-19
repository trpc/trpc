import './___packages';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

global.fetch = vi.fn() as any;

describe('typedefs on createClient', () => {
  test('ok to pass only links', () => {
    createTRPCProxyClient({
      links: [httpBatchLink({ url: 'foo' })],
    });
  });

  test('error if both url and links are passed', () => {
    createTRPCProxyClient({
      links: [httpBatchLink({ url: 'foo' })],
      // @ts-expect-error - can't pass url along with links
      url: 'foo',
    });
  });
});
