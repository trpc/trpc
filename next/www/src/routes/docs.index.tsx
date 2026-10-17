import { createFileRoute, redirect } from '@tanstack/react-router';

import { firstDoc } from '~/content/docs.ts';

export const Route = createFileRoute('/docs/')({
  beforeLoad: () => {
    throw redirect({ params: { _splat: firstDoc }, to: '/docs/$' });
  },
});
