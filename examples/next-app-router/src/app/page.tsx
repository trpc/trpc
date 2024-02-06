import { HydrateClient, trpc } from '~/trpc/server';
import { Suspense } from 'react';
import { Posts } from './_components/posts';
import { UserButton } from './_components/user-button';

export default async function Home() {
  // prefetch in RSC
  await trpc.post.list();

  return (
    <main className="container max-w-xl py-8">
      <Suspense>
        <div className="absolute right-8 top-8">
          <UserButton />
        </div>
      </Suspense>
      <HydrateClient>
        <Posts />
      </HydrateClient>
    </main>
  );
}
