import { QueryClientProvider } from '@tanstack/react-query';
import { Users } from './Users';
import { queryClient } from './utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Users />
    </QueryClientProvider>
  );
}
