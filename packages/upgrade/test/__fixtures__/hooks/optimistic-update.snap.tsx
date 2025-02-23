import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTRPC } from './optimistic-update.trpc';

export function Component() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const postCreate = useMutation(
    trpc.post.create.mutationOptions({
      async onMutate(newPost) {
        await queryClient.cancelQueries(trpc.post.list.pathFilter());

        const prevData = queryClient.getQueryData(trpc.post.list.queryKey());
        queryClient.setQueryData(trpc.post.list.queryKey(), (old) => [
          ...(old ?? []),
          newPost.title,
        ]);

        return { prevData };
      },
      onError(_err, _newPost, ctx) {
        queryClient.setQueryData(trpc.post.list.queryKey(), ctx?.prevData);
      },
      onSettled() {
        queryClient.invalidateQueries(trpc.post.list.pathFilter());
      },
    }),
  );

  const posts = useQuery(trpc.post.list.queryOptions());

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
