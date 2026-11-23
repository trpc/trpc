import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTRPC } from './basic.trpc';

declare function makeInvalidator(utils: unknown): void;

// A returned tuple is not a dependency list
export function useInvalidator() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidate = useCallback(
    () => queryClient.invalidateQueries(trpc.post.list.pathFilter()),
    [trpc, queryClient],
  );
  // TODO(@trpc/upgrade): `utils` is now the QueryClient; update what receives it, see https://trpc.io/docs/client/tanstack-react-query/migrating
  return [invalidate, queryClient] as const;
}

// What receives `utils` expects the old object
export function Component2() {
  const queryClient = useQueryClient();
  // TODO(@trpc/upgrade): `utils` is now the QueryClient; update what receives it, see https://trpc.io/docs/client/tanstack-react-query/migrating
  makeInvalidator(queryClient);
  return null;
}
