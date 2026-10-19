import { QueryClientProvider } from '@tanstack/react-query';
import { Checkout } from './Checkout';
import { Greeting } from './Greeting';
import { Maintenance } from './Maintenance';
import { SafeCheckout } from './SafeCheckout';
import { queryClient } from './utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main style={{ fontFamily: 'sans-serif', maxWidth: 640, padding: 16 }}>
        <h1>Per-procedure errors</h1>
        <Greeting />
        <Checkout />
        <Maintenance />
        <SafeCheckout />
      </main>
    </QueryClientProvider>
  );
}
