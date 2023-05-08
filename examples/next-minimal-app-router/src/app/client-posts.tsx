'use client';

import { Button } from '~/components/button';
import { trpc } from '~/utils/trpc-client';

export function ClientPosts() {
  const { data: posts, isLoading, mutate } = trpc.postList.useQuery();

  return (
    <div>
      <h2 className="text-lg font-bold">Posts - Client rendered</h2>
      {isLoading && <p>Loading...</p>}
      <ul>
        {posts?.map((post) => (
          <li key={post.id}>
            <h2>{post.title}</h2>
          </li>
        ))}
      </ul>

      <Button onClick={() => mutate()}>Revalidate</Button>
    </div>
  );
}
