import { createFileRoute } from '@tanstack/react-router';

import { NotFound } from '~/components/not-found.tsx';
import { site } from '~/site.ts';

// Prerendered to `404.html`, which static hosts serve for unknown paths.
export const Route = createFileRoute('/404')({
  head: () => ({
    meta: [
      { title: `Page not found | ${site.name}` },
      { content: 'noindex', name: 'robots' },
    ],
  }),
  component: NotFound,
});
