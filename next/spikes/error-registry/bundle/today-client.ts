/** v12's own client and `matchError()`, by code, over the app with no registry. */
import {
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import type { AppRouter } from './plain-app.ts';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc' })],
});

export async function title(id: string): Promise<string> {
  const [post, err] = await safe(client.post.byId.query({ id }));
  if (!err) return post.title;
  return matchError(err, {
    PostNotFound: (e) => `No post ${e.data.id}`,
    TitleTaken: (e) => `${e.data.title} is taken`,
    BAD_REQUEST: () => 'Invalid',
    NETWORK_ERROR: () => 'Offline',
    BAD_RESPONSE: () => 'Try again',
    unexpected: (e) => e.message,
  });
}
