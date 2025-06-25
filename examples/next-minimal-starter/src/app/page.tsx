import { HydrateClient, prefetch, trpc } from '../trpc/server/server';
import { Content } from './content';

export default function Page() {
  void prefetch(trpc.greeting.queryOptions());

  return (
    <HydrateClient>
      <Content />
    </HydrateClient>
  );
}
