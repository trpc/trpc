'use client';
import { Button } from '@shared/ui/components/button';
import { Input } from '@shared/ui/components/input';
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
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1">
        {query.data.map((post) => (
          // `createdAt` is still a `Date` after hydration.
          <li key={post.id}>
            {post.title}{' '}
            <small className="text-muted-foreground">
              {post.createdAt.toISOString()}
            </small>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ title });
          setTitle('');
        }}
      >
        <Input
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </form>
    </div>
  );
}
