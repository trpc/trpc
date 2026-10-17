'use client';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';
import { useTrpc } from '../trpc/client.tsx';

export function Posts() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const query = useSuspenseQuery(trpc.post.list.queryOptions());
  const create = useMutation(
    trpc.post.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
    }),
  );
  const [title, setTitle] = useState('');
  return (
    <section>
      <h2>Posts</h2>
      <ul>
        {query.data.map((post) => (
          // `createdAt` is still a `Date` after hydration.
          <li key={post.id}>
            {post.title} <small>{post.createdAt.toISOString()}</small>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ title });
          setTitle('');
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <button disabled={create.isPending}>Add</button>
      </form>
    </section>
  );
}
