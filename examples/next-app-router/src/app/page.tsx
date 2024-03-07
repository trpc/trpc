import { HydrateClient, PrefetchQuery, trpc } from '~/trpc/server';
import { Suspense } from 'react';
import { Posts } from './_components/posts';
import { UserButton } from './_components/user-button';
import { WaitCard } from './_components/wait-card';

export default async function Home() {
  // prefetch in RSC, use the proxy if you
  // need to access the data in the RSC too
  const _posts = await trpc.post.list();

  return (
    <main className="container max-w-xl py-8">
      <Suspense>
        <div className="absolute right-8 top-8">
          <UserButton />
        </div>
      </Suspense>
      <HydrateClient>
        {/* 
          🤯 Client Component will have the data
             without needing to do a clientside fetch
        */}
        <Posts />
      </HydrateClient>

      <Suspense fallback="Loading 1">
        {/* 
          💡 Use the `PrefetchQuery` helper if you don't
             need the data in the RSC and just wanna prefetch
        */}
        <PrefetchQuery query={trpc.wait({ ms: 1000 })}>
          <WaitCard ms={1000} />
        </PrefetchQuery>
        {/* 
          💡 You can do nested suspense boundaries
        */}
        <Suspense fallback="Loading 2">
          <PrefetchQuery query={trpc.wait({ ms: 2000 })}>
            <WaitCard ms={2000} />
          </PrefetchQuery>
          <PrefetchQuery query={trpc.wait({ ms: 500 })}>
            <WaitCard ms={500} />
          </PrefetchQuery>
        </Suspense>
      </Suspense>
    </main>
  );
}
