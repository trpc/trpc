import { HydrateClient, trpc } from '~/trpc/server';
import { Suspense } from 'react';
import { Posts } from './_components/posts';
import { UserButton } from './_components/user-button';
import { WaitCard } from './_components/wait-card';

export default async function Home() {
  // Query Data server-side. Using the caller
  // will not seed the query client
  const _posts = await trpc.post.list();

  // You can also use the `prefetch` helper
  // to start the procedure execution in the RSC
  // and the promise will be put into the query client
  // and be used on the client by a `useQuery` or `useSuspenseQuery`
  // hook.
  void trpc.wait.prefetch({ ms: 1000 });
  void trpc.wait.prefetch({ ms: 2000 });
  void trpc.wait.prefetch({ ms: 500 });

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
