/*import { createReactQueryHooks } from '@trpc/react';
import type { AppRouter } from '../pages/api/trpc/[trpc]';

export const trpc = createReactQueryHooks<AppRouter>();
// => { useQuery: ..., useMutation: ...}
*/
import { setupTRPC } from '@trpc/next';
import { AppRouter } from '../pages/api/trpc/[trpc]';

export const trpc = setupTRPC<AppRouter>({
  config() {
    return {
      url: '/api/trpc',
    };
  },
});
