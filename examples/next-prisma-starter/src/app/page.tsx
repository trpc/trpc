import { Badge } from '@shared/ui/components/badge';
import {
  ensureInfiniteEntry,
  loadHandles,
} from '@trpc/tanstack-react-query/unstable-handles';
import Link from 'next/link';
import { HydrateClient, trpc } from '~/trpc/server';
import { AddPostCard } from './add-post-card';
import { PostsCard } from './posts-card';

// Render on every request, so the list is never a snapshot from the build
export const dynamic = 'force-dynamic';

export default async function IndexPage() {
  // Waits for the first page, so it is in the first HTML
  // @see https://trpc.io/docs/v11/client/tanstack-react-query/handles#nextjs-app-router
  const [handles] = await loadHandles(trpc, {
    posts: ensureInfiniteEntry(trpc.post.list, { limit: 5 }),
  });

  return (
    <HydrateClient>
      <div className="flex flex-col gap-10">
        <section className="flex flex-col items-start gap-4">
          <Badge variant="secondary">Next.js · tRPC · Prisma</Badge>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Welcome to your tRPC with Prisma starter!
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            If you get stuck, check{' '}
            <Link className="text-foreground underline" href="https://trpc.io">
              the docs
            </Link>
            , write a message in our{' '}
            <Link
              className="text-foreground underline"
              href="https://trpc.io/discord"
            >
              Discord-channel
            </Link>
            , or write a message in{' '}
            <Link
              className="text-foreground underline"
              href="https://github.com/trpc/trpc/discussions"
            >
              GitHub Discussions
            </Link>
            .
          </p>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
          <PostsCard posts={handles.posts} />
          <AddPostCard />
        </div>
      </div>
    </HydrateClient>
  );
}
