import { QueryClientProvider } from '@tanstack/react-query';
import { Checkout } from './Checkout';
import { Greeting } from './Greeting';
import { Maintenance } from './Maintenance';
import { SafeCheckout } from './SafeCheckout';
import { queryClient } from './utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-svh bg-muted/40">
        <header className="border-b bg-background">
          <div className="mx-auto max-w-2xl px-6 py-4">
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-brand">tRPC</span> Per-procedure errors
            </h1>
            <p className="text-sm text-muted-foreground">
              Typed error shapes per procedure with <code>.errors()</code>
            </p>
          </div>
        </header>
        <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
          <Greeting />
          <Checkout />
          <Maintenance />
          <SafeCheckout />
        </main>
      </div>
    </QueryClientProvider>
  );
}
