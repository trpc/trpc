import { trpc } from './basic.trpc';

// `mutation.trpc` is on the options now
export function Component() {
  const mutation = trpc.post.create.useMutation();
  const query = trpc.post.list.useQuery();
  return [mutation.trpc.path, query.trpc.path];
}

export function Component2(flag: boolean) {
  const mutation = { trpc: { path: 'outer' } };
  if (flag) {
    // Only this block's `mutation` is the hook's result
    const mutation = trpc.post.create.useMutation();
    void mutation.trpc.path;
  }
  // `trpc` destructured from the result needs a hand
  const { trpc: meta } = trpc.post.list.useQuery();
  // The quoted key is the case under test
  // prettier-ignore
  const { 'trpc': meta2 } = trpc.post.list.useQuery();
  const { ['trpc']: meta3 } = trpc.post.list.useQuery();
  return [mutation.trpc.path, meta, meta2, meta3];
}
