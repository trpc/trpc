import React from 'react';
import { HydrateClient, prefetch, trpc } from '~/trpc/rq-server';
import { PageHeader } from '../_components/page-header';
import { Post } from './post';

export const dynamic = 'force-dynamic';

export default function Home() {
  prefetch(trpc.getLatestPost.queryOptions());

  return (
    <>
      <PageHeader
        title="RSC + React Query"
        description={
          <>
            A Server Component prefetches <code>getLatestPost</code> and
            hydrates it. The client reads it with <code>useSuspenseQuery</code>{' '}
            and invalidates it after <code>createPost</code>.
          </>
        }
      />
      <HydrateClient>
        <Post />
      </HydrateClient>
    </>
  );
}
