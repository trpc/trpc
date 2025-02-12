import { trpc } from './trpc';

export function Component() {
  const utils = trpc.useUtils();

  const mutation = trpc.post.create.useMutation({
    onSettled: () => {
      utils.post.invalidate();
      utils.post.list.invalidate();
      utils.post.x.y.z.longPropName.invalidate();

      // eslint-disable-next-line @typescript-eslint/dot-notation
      utils['post'].invalidate();
    },
  });
}
