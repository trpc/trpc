import * as React from 'react';
import { trpc } from './optimistic-update.trpc';

export function Component() {
  const utils = trpc.useUtils();
  const postCreate = trpc.post.create.useMutation({
    async onMutate(newPost) {
      await utils.post.list.cancel();

      const prevData = utils.post.list.getData();
      utils.post.list.setData(undefined, (old) => [
        ...(old ?? []),
        newPost.title,
      ]);

      return { prevData };
    },
    onError(_err, _newPost, ctx) {
      utils.post.list.setData(undefined, ctx?.prevData);
    },
    onSettled() {
      utils.post.list.invalidate();
    },
  });

  const posts = trpc.post.list.useQuery();

  return (
    <>
      <button
        data-testid="mutate"
        onClick={() => postCreate.mutate({ title: 'Foo' })}
      ></button>

      <span>Posts: {posts.data?.length}</span>
      {posts.data?.map((post, i) => (
        <div data-testid={`post:${i}`} key={post}>
          {post}
        </div>
      ))}
    </>
  );
}
