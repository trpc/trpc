import { createFileRoute, redirect } from '@tanstack/react-router';

import { v12Docs } from '~/content/docs.ts';

export const Route = createFileRoute('/docs/')({
  beforeLoad: () => {
    throw redirect({ params: { _splat: v12Docs.firstDoc }, to: '/docs/$' });
  },
});
