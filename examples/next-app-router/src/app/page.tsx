import { HydrateClient, trpc } from '~/trpc/server';
import { Suspense } from 'react';
import { Posts } from './_components/posts';
import { UserButton } from './_components/user-button';
import { WaitCard } from './_components/wait-card';

export default async function Home() {
  // prefetch in RSC, you can await if you
  // need to access the data in the RSC too
  const _posts = await trpc.post.list();

  // Or just void the promise to start
  // prefetching without blocking until
  // the query is used by `useSuspenseQuery`
  // in a child component
  trpc.wait({ ms: 1000 });
  trpc.wait({ ms: 2000 });
  trpc.wait({ ms: 500 });

  return (
    <HydrateClient>
      <main className="container max-w-xl py-8">
        <Suspense>
          <div className="absolute right-8 top-8">
            <UserButton />
          </div>
        </Suspense>

        {/* 
          🤯 Client Component will have the data
             without needing to do a clientside fetch
        */}
        <Posts />

        <Suspense fallback="Loading 1">
          <WaitCard ms={1000} />
          {/* 
          💡 You can do nested suspense boundaries
        */}
          <Suspense fallback="Loading 2">
            <WaitCard ms={2000} />
            <WaitCard ms={500} />
          </Suspense>
        </Suspense>
      </main>
    </HydrateClient>
  );
}
