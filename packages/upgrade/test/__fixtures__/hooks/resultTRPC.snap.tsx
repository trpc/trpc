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

export function Component2(flag: boolean) {
  const trpc = useTRPC();
  const mutation = { trpc: { path: 'outer' } };
  if (flag) {
    // Only this block's `mutation` is the hook's result
    const mutation = useMutation(trpc.post.create.mutationOptions());
    void trpc.post.create.mutationOptions().trpc.path;
  }
  // `trpc` destructured from the result needs a hand
  // TODO(@trpc/upgrade): `trpc` is on the options now: `trpc.x.queryOptions(…).trpc`, see https://trpc.io/docs/client/tanstack-react-query/migrating
  const { trpc: meta } = useQuery(trpc.post.list.queryOptions());
  // The quoted key is the case under test
  // prettier-ignore
  // TODO(@trpc/upgrade): `trpc` is on the options now: `trpc.x.queryOptions(…).trpc`, see https://trpc.io/docs/client/tanstack-react-query/migrating
  const { 'trpc': meta2 } = useQuery(trpc.post.list.queryOptions());
  // TODO(@trpc/upgrade): `trpc` is on the options now: `trpc.x.queryOptions(…).trpc`, see https://trpc.io/docs/client/tanstack-react-query/migrating
  const { ['trpc']: meta3 } = useQuery(trpc.post.list.queryOptions());
  return [mutation.trpc.path, meta, meta2, meta3];
}
