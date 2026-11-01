import { createFileRoute, redirect } from '@tanstack/react-router';

import { v10Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/v10/docs/')({
  beforeLoad: () => {
    throw redirect({
      params: { _splat: v10Docs.firstDoc },
      to: '/v10/docs/$',
    });
  },
});
