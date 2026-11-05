import { createFileRoute } from '@tanstack/react-router';

import { BlogPost, postHead } from '~/components/blog.tsx';
import { loadPost } from '~/content/blog.ts';
import { loadPageDemos } from '~/demos/page-demos.tsx';

export const Route = createFileRoute('/blog/$slug')({
  loader: async (args) => {
    const post = await loadPost(args.params.slug);
    await loadPageDemos(post.html);
    return { post };
  },
  head: (args) => postHead(args.params.slug),
  component: () => <BlogPost post={Route.useLoaderData().post} />,
});
