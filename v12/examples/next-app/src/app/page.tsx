import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Spinner } from '@shared/ui/components/spinner';
import { connection } from 'next/server';
import { Suspense, type ReactNode } from 'react';
import { HydrationBoundary, prefetch, trpc } from '../trpc/server.ts';
import { Chat } from './chat.tsx';
import { Files } from './files.tsx';
import { Guestbook } from './guestbook/guestbook.tsx';
import { Posts } from './posts.tsx';

export default function Page() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">tRPC v12 + Next.js</h1>
      <Section
        title="Posts"
        description="Prefetched in a server component, streamed into TanStack Query."
      >
        <Suspense fallback={<Spinner />}>
          <PrefetchedPosts />
        </Suspense>
      </Section>
      <Section
        title="Guestbook"
        description="A Server Action form. The list is in Next's data cache under cacheTags; the action revalidates it."
      >
        <Guestbook />
      </Section>
      <Section title="Streamed mutation" description="Each word as it arrives.">
        <Chat />
      </Section>
      <Section title="Files" description="File inputs and outputs.">
        <Files />
      </Section>
    </main>
  );
}

async function PrefetchedPosts() {
  // Request time: posts change between requests.
  await connection();
  // Started on the server, streamed to the browser's cache.
  prefetch(trpc.post.list.queryOptions());
  return (
    <HydrationBoundary>
      <Posts />
    </HydrationBoundary>
  );
}

function Section(props: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{props.title}</h2>
        </CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}
