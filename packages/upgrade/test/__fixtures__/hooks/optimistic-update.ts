import { trpc } from './trpc';

export function Component() {
  const utils = trpc.useUtils();
  const postCreate = trpc.post.create.useMutation({
    async onMutate(newPost) {
      await utils.post.list.cancel();

      const prevData = utils.post.list.getData();
      utils.post.list.setData(undefined, (old) => [...old, newPost]);

      return { prevData };
    },
    onError(err, newPost, ctx) {
      utils.post.list.setData(undefined, ctx.prevData);
    },
    onSettled() {
      utils.post.list.invalidate();
    },
  });
}
