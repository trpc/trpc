'use client';

import { inferProcedureOutput } from '@trpc/server';
import * as React from 'react';
import { Button } from '~/components/button';
import { AppRouter } from '~/server/router';
import { trpc } from '~/utils/trpc-client';

export function ClientPosts() {
  const [posts, setPosts] =
    React.useState<inferProcedureOutput<AppRouter['postList']>>();

  React.useEffect(() => {
    void trpc.postList.query().then((data) => {
      setPosts(data);
    });
  }, []);

  return (
    <div>
      <h2 className="text-lg font-bold">Posts - Client rendered</h2>
      {!posts && <p>Loading...</p>}
      <ul>
        {posts?.map((post) => (
          <li key={post.id}>
            <h2>{post.title}</h2>
          </li>
        ))}
      </ul>
      <Button onClick={() => trpc.postList.revalidate()}>
        Revalidate client side
      </Button>
    </div>
  );
}
