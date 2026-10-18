import { createFileRoute, redirect } from '@tanstack/react-router';

import { v12Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/v12/docs/')({
  beforeLoad: () => {
    throw redirect({ params: { _splat: v12Docs.firstDoc }, to: '/v12/docs/$' });
  },
});
