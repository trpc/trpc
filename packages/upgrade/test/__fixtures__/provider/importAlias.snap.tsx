import { createTRPCClient } from '@trpc/client';
import { TRPCProvider } from './basic.trpc';

// The setup is `api`; this file calls it `trpc`
export function App({ children }: { children: React.ReactNode }) {
  // TODO(@trpc/upgrade): add your router type: `createTRPCClient<AppRouter>()`
  const client = createTRPCClient({ links: [] });
  return (
    <TRPCProvider trpcClient={client} queryClient={null as never}>
      {children}
    </TRPCProvider>
  );
}
