import { trpc } from './trpc';

export function Component() {
  const utils = trpc.useUtils();

  const mutation = trpc.post.create.useMutation({
    onSettled: () => utils.post.invalidate(),
  });
}
