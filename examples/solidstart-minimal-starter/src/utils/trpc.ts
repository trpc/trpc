import { QueryClient } from '@adeora/solid-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCSolid } from 'solid-trpc';
import { AppRouter } from '~/server/trpc';

const getBaseUrl = () => {
  if (typeof window !== 'undefined') return '';
  return `http://localhost:${process.env.PORT ?? 5173}`;
};

export const trpc = createTRPCSolid<AppRouter>();
export const client = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
    }),
  ],
});
export const queryClient = new QueryClient();
