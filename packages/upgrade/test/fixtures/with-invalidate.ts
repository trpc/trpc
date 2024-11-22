import { trpc } from './trpc';

export function Component() {
  const { data } = trpc.post.list.useQuery();
  const utils = trpc.useUtils();

  const mutation = trpc.post.create.useMutation({
    onSettled: () => utils.post.invalidate(),
  });
}
