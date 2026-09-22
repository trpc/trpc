import { dehydrate, HydrationBoundary, noop } from '@tanstack/react-query';
import { getQueryClient, trpc } from '~/trpc/server';
import { Greeting } from './greeting';

// The tRPC context reads `headers()`, so this page opts out of static
// generation and is rendered dynamically at request time.
export const dynamic = 'force-dynamic';

export default function Home() {
  const queryClient = getQueryClient();
  void queryClient
    .query(trpc.hello.queryOptions({ text: 'world' }))
    .catch(noop);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Greeting />
    </HydrationBoundary>
  );
}
