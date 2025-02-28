import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function Component() {
  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  useMutation({ mutationFn: async () => 1 });

  return useQueryClient().isFetching() ? 'loading' : 'loaded';
}
