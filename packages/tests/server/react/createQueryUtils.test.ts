import { createQueryClient } from '../__queryClient';
import { createAppRouter } from './__testHelpers';
import { createQueryUtils } from '@trpc/react-query';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

describe('createQueryUtils()', () => {
  test('ensureData()', async () => {
    const { client } = factory;
    const queryClient = createQueryClient();
    const clientUtils = createQueryUtils(queryClient, client);

    async function prefetch() {
      const initialQuery = await clientUtils.postById.ensureData('1');
      expect(initialQuery.title).toBe('first post');

      const cachedQuery = await clientUtils.postById.ensureData('1');
      expect(cachedQuery.title).toBe('first post');

      // Update data to invalidate the cache
      clientUtils.postById.setData('1', () => {
        return {
          id: 'id',
          title: 'updated post',
          createdAt: Date.now(),
        };
      });

      const updatedQuery = await clientUtils.postById.ensureData('1');
      expect(updatedQuery.title).toBe('updated post');
    }
    await prefetch();

    // Because we are using `ensureData` here, it should always be only a single call
    // as the first invocation will fetch and cache the data, and any consecutive calls
    // will not go through `postById.fetch`, but rather get the data directly from cache.
    //
    // Calling `postById.setData` updates the cache as well, so even after update
    // number of direct calls should still be 1.
    expect(factory.resolvers.postById.mock.calls.length).toBe(1);
    expect(factory.resolvers.postById.mock.calls[0]![0]).toBe('1');
  });
});
