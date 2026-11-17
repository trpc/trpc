import { useMutation, useQuery } from '@tanstack/react-query';
import { useTRPC } from './basic.trpc';

// `mutation.trpc` is on the options now
export function Component() {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.post.create.mutationOptions());
  const query = useQuery(trpc.post.list.queryOptions());
  // TODO(@trpc/upgrade): `query.trpc` is on the options now: `trpc.x.queryOptions(input).trpc`, see https://trpc.io/docs/client/tanstack-react-query/migrating
  return [trpc.post.create.mutationOptions().trpc.path, query.trpc.path];
}
