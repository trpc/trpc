// The Effect-native client with its HTTP link.
import { routerType } from '@trpc12/trpc/client';
import { createEffectClient, httpStreamLink } from '@trpc12/trpc/effect';

export const client = createEffectClient({
  router: routerType<any>(),
  links: [httpStreamLink({ url: '/trpc' })],
});
