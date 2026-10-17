// #region call
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';

import type { AppRouter } from './server.ts';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc' })],
});

const post = await client.post.byId.query({ id: '1' });
//    ^?
console.log(post.title);

const [created, err] = await safe(client.post.create.mutate({ title: '' }));
if (err?.defined && err.code === 'BAD_REQUEST') {
  console.log(err.data.issues);
} else if (created) {
  console.log(created.id);
}
// #endregion call
