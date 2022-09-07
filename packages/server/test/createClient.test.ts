import { createTRPCClient } from '../../client';
import { httpBatchLink } from '../../client/src';

global.fetch = jest.fn();

describe('typedefs on createClient', () => {
  test('ok to pass only links', () => {
    createTRPCClient({
      links: [httpBatchLink({ url: 'foo' })],
    });
  });

  test('ok to pass only url', () => {
    createTRPCClient({
      url: 'foo',
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
