import { HashtagIcon } from '@heroicons/react/24/outline';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { SignedIn, SignedOut, useSignInHref } from '~/components/auth';
import { buttonVariants } from '~/components/button';
import { CreateChannelDialog } from '~/components/create-channel';
import { useTRPC, type TRPC } from '~/lib/trpc';
import { Suspense } from 'react';
import { twMerge } from 'tailwind-merge';

export const Route = createFileRoute('/')({
  loader: (opts) => ({
    channels: opts.context.trpc.channel.list.unstable_$prefetch(),
  }),
  component: Home,
});

function Home() {
  const { channels } = Route.useLoaderData();
  const signInHref = useSignInHref();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex h-full flex-col">
        <header className="p-4">
          <h1 className="text-3xl font-bold text-gray-950 dark:text-gray-50">
            tRPC SSE starter
          </h1>
          <p className="text-sm text-gray-700 dark:text-gray-400">
            Showcases Server-sent Events + subscription support
            <br />
            <a
              className="text-gray-700 underline dark:text-gray-400"
              href="https://github.com/trpc/examples-tanstack-start-sse-chat"
              target="_blank"
              rel="noreferrer"
            >
              View Source on GitHub
            </a>
          </p>
        </header>

        <article className="space-y-2 p-4 text-sm text-gray-700 dark:text-gray-400">
          <h2 className="text-lg font-medium text-gray-950 dark:text-gray-50">
            Introduction
          </h2>
          <ul className="list-inside list-disc space-y-2">
            <li>Open inspector and head to Network tab</li>
            <li>All client requests are handled through HTTP</li>
            <li>
              We have a simple backend subscription on new messages that adds
              the newly added message to the current state
            </li>
          </ul>
        </article>

        <div className="mt-6 space-y-2 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-950 dark:text-gray-50">
              Channels
            </h2>
            <SignedIn>
              <CreateChannelDialog />
            </SignedIn>
            <SignedOut>
              <a href={signInHref}>Login</a>
            </SignedOut>
          </div>
          <Suspense fallback={<div className="text-sm italic">Loading...</div>}>
            <ChannelList channels={channels} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function ChannelList(
  props: Readonly<{
    channels: unstable_inferQueryHandle<TRPC['channel']['list']>;
  }>,
) {
  const trpc = useTRPC();
  const channelsQuery = useSuspenseQuery(
    trpc.unstable_$fromHandle(props.channels),
  );

  return (
    <div className="flex w-full flex-col items-start">
      {channelsQuery.data.map((channel) => (
        <Link
          key={channel.id}
          className={twMerge(
            buttonVariants({ variant: 'link' }),
            'w-full justify-start',
          )}
          to="/channels/$channelId"
          params={{ channelId: channel.id }}
        >
          <HashtagIcon className="mr-2 size-4 shrink-0" />
          <span className="truncate">{channel.name}</span>
        </Link>
      ))}
    </div>
  );
}
