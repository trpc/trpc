import { createFileRoute } from '@tanstack/react-router';

import { BlogIndex, blogHead } from '~/components/blog.tsx';

export const Route = createFileRoute('/blog/')({
  head: blogHead,
  component: BlogIndex,
});
