import { createFileRoute } from '@tanstack/react-router';

import { BlogPost, postHead } from '~/components/blog.tsx';
import { loadPost } from '~/content/blog.ts';

export const Route = createFileRoute('/blog/$slug')({
  loader: async (args) => ({ post: await loadPost(args.params.slug) }),
  head: (args) => postHead(args.params.slug),
  component: () => <BlogPost post={Route.useLoaderData().post} />,
});
