import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './basic.trpc';

// A setup inside a function stays, and so do its uses
export function makeApp(children: React.ReactNode) {
  const trpc = createTRPCReact<AppRouter>();
  const client = trpc.createClient({ links: [] });
  return (
    <trpc.Provider client={client} queryClient={null as never}>
      {children}
    </trpc.Provider>
  );
}
