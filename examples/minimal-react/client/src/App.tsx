import { QueryClientProvider } from '@tanstack/react-query';
import { Greeting } from './Greeting';
import { queryClient } from './utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-svh bg-muted/40">
        <header className="border-b bg-background">
          <div className="mx-auto max-w-2xl px-6 py-4">
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-brand">tRPC</span> Minimal React
            </h1>
            <p className="text-sm text-muted-foreground">
              A Vite + React app on @trpc/tanstack-react-query
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-2xl p-6">
          <Greeting />
        </main>
      </div>
    </QueryClientProvider>
  );
}
