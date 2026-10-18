import { createFileRoute, redirect } from '@tanstack/react-router';

import { v11Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/docs/')({
  beforeLoad: () => {
    throw redirect({
      params: { _splat: v11Docs.firstDoc },
      to: '/docs/$',
    });
  },
});
