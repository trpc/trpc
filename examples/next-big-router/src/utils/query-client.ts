import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient();
}
