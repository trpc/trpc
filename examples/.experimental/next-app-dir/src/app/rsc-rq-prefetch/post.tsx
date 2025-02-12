'use client';

import { trpc } from '~/trpc/rq-client';
import React from 'react';

export function Post() {
  const utils = trpc.useUtils();
  const [latestPost] = trpc.getLatestPost.useSuspenseQuery();

  const { mutate: createPost } = trpc.createPost.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
    },
  });

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
