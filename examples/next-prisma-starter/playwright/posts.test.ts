import { TRPCClient } from '@trpc/client';
import { AppRouter } from 'routers/appRouter';
import fetch from 'node-fetch';
import AbortController from 'abort-controller';

test('create and get post', async () => {
  const client = new TRPCClient<AppRouter>({
    url: 'http://localhost:3000/api/trpc',
    fetchOpts: {
      AbortController: AbortController as any,
      fetch: fetch as any,
    },
  });

  const nonce = `${Math.random()}`;
  const { id } = await client.mutation('posts.add', {
    title: nonce,
    text: nonce,
  });
  const post = await client.query('posts.byId', id);
  expect(post).toMatchObject({
    id,
    title: nonce,
    text: nonce,
  });
});
