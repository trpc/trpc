import { QueryClientProvider } from '@tanstack/react-query';
import { Greeting } from './Greeting';
import { queryClient } from './utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Greeting />
    </QueryClientProvider>
  );
}
