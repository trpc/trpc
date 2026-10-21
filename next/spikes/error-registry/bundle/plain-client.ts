/** The same client of an app with no registry. */
import { httpLink } from '@trpc12/trpc/client';
import type { AppRouter } from './plain-app.ts';
import { createClient, matchError, safe } from '../shared/client.ts';

const client = createClient<AppRouter>({ links: [httpLink({ url: '/trpc' })] });

export async function title(id: string): Promise<string> {
  const [post, err] = await safe(client.post.byId.query({ id }));
  if (!err) return post.title;
  return matchError(err, {
    PostNotFound: (e) => `No post ${e.data.id}`,
    TitleTaken: (e) => `${e.data.title} is taken`,
    NetworkError: () => 'Offline',
    BadResponse: () => 'Try again',
    unexpected: (e) => e.message,
  });
}
