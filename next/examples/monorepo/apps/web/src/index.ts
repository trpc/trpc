/**
 * An app that uses the whole API. `AppRouter` comes from `@acme/api`, a
 * project reference, so `tsc -b` reads the api's built declarations instead
 * of type-checking every domain again.
 */
import type { AppRouter } from '@acme/api';
import {
  createTrpcClient,
  httpStreamLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';

export async function run(url: string) {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpStreamLink({ url, batch: true, headers: { authorization: 'ada' } }),
    ],
  });

  const post = await client.posts.byId.query({ id: '1' });
  const created = await client.posts.create.mutate({ title: 'From the web' });
  const me = await client.users.me.query();
  const [, missing] = await safe(client.posts.byId.query({ id: '404' }));

  return {
    post: post.title,
    createdBy: created.authorId,
    me: me.name,
    missing:
      missing?.defined && missing.code === 'NOT_FOUND' ? missing.data.id : null,
  };
}
