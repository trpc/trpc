'use client';

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useTRPC } from '~/trpc/rq-client';

export function Post() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: latestPost } = useSuspenseQuery(
    trpc.getLatestPost.queryOptions(),
  );

  const { mutate: createPost } = useMutation(
    trpc.createPost.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.getLatestPost.queryFilter());
      },
    }),
  );

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span>Title: {latestPost.title}</span>
        <span>Content: {latestPost.content}</span>
        <span>Created At: {latestPost.createdAt.toLocaleString('en-US')}</span>
      </div>
      <form
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 300,
          marginTop: 16,
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.target as HTMLFormElement);
          createPost({
            title: data.get('title') as string,
            content: data.get('content') as string,
          });
        }}
      >
        <input name="title" placeholder="title" />
        <input name="content" placeholder="content" />
        <button type="submit">Create Post!</button>
      </form>
    </div>
  );
}
