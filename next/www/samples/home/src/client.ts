// #region call
// #region hero
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
// #endregion hero
import { safe } from '@trpc12/trpc/client';
// #region hero

import type { AppRouter } from './server.ts';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc' })],
});

const post = await client.post.byId.query({ id: '1' });
//    ^?
// #endregion hero
console.log(post.title);

const [created, err] = await safe(client.post.create.mutate({ title: '' }));
if (err?.defined && err.code === 'BAD_REQUEST') {
  console.log(err.data.issues);
} else if (created) {
  console.log(created.id);
}
// #endregion call
