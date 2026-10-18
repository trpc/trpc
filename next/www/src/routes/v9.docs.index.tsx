import { createFileRoute, redirect } from '@tanstack/react-router';

import { v9Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/v9/docs/')({
  beforeLoad: () => {
    throw redirect({
      params: { _splat: v9Docs.firstDoc },
      to: '/v9/docs/$',
    });
  },
});
