import { useMutation, useQuery } from '@tanstack/react-query';

export function Component() {
  useQuery({ queryKey: ['a'], queryFn: () => 1 });
  useMutation({ mutationFn: () => 1 });
}
