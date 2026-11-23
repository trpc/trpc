import { api as trpc } from './basic.trpc';

// The setup is `api`; this file calls it `trpc`
export function App({ children }: { children: React.ReactNode }) {
  const client = trpc.createClient({ links: [] });
  return (
    <trpc.Provider client={client} queryClient={null as never}>
      {children}
    </trpc.Provider>
  );
}
