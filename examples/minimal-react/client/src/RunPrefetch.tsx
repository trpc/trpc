import { trpc } from './utils/trpc';

export function RunPrefetch() {
  trpc.greeting.usePrefetchQuery({ name: 'tRPC user' });

  return <div>Prefeteching!</div>;
}
