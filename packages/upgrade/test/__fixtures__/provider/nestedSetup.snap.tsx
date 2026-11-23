import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './basic.trpc';

// A setup inside a function stays, and so do its uses
export function makeApp(children: React.ReactNode) {
  const trpc = createTRPCReact<AppRouter>();
  // TODO(@trpc/upgrade): migrate by hand: this `trpc` is not a top-level setup
  const client = trpc.createClient({ links: [] });
  // TODO(@trpc/upgrade): migrate by hand: this `trpc` is not a top-level setup
  return (
    <trpc.Provider client={client} queryClient={null as never}>
      {children}
    </trpc.Provider>
  );
}
