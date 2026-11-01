import { HashtagIcon } from '@heroicons/react/24/outline';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import {
  SignedIn,
  SignedOut,
  signOutHref,
  useSignInHref,
} from '~/components/auth';
import { Button } from '~/components/button';
import { CreateChannelDialog } from '~/components/create-channel';
import { useTRPC } from '~/lib/trpc';
import { channelListQuery, postListQuery } from '~/queries';
import { Chat } from './-components/chat';

export const Route = createFileRoute('/channels/$channelId')({
  beforeLoad: (opts) => {
    if (!z.string().uuid().safeParse(opts.params.channelId).success) {
      // oxlint-disable-next-line typescript/only-throw-error -- the router's not-found signal
      throw notFound();
    }
  },
  loader: (opts) => {
    const { queryClient, trpc } = opts.context;
    void queryClient.prefetchQuery(channelListQuery(trpc));
    void queryClient.prefetchInfiniteQuery(
      postListQuery(trpc, { channelId: opts.params.channelId }),
    );
  },
  component: ChannelPage,
});

function ChannelPage() {
  const { channelId } = Route.useParams();
  const signInHref = useSignInHref();

  return (
    <div className="flex flex-1 overflow-hidden">
      <nav className="hidden w-64 flex-col border-r bg-white p-4 sm:flex dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <HashtagIcon className="size-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium">Channels</span>
          </div>
          <SignedIn>
            <CreateChannelDialog />
          </SignedIn>
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          <Suspense>
            <ChannelList />
          </Suspense>
        </div>
        <div className="mt-auto">
          <div className="flex items-center justify-between">
            <SignedIn>
              {({ user }) => (
                <>
                  <span className="text-sm font-medium">
                    Hello, {user.name} 👋
                  </span>
                  <Button asChild size="sm">
                    <a href={signOutHref}>Sign Out</a>
                  </Button>
                </>
              )}
            </SignedIn>
            <SignedOut>
              <Button asChild size="sm" className="w-full">
                <a href={signInHref}>Sign In</a>
              </Button>
            </SignedOut>
          </div>
        </div>
      </nav>
      <Suspense
        fallback={
          <div className="flex h-full flex-1 flex-row items-center justify-center italic">
            Loading....
          </div>
        }
      >
        <Chat key={channelId} channelId={channelId} />
      </Suspense>
    </div>
  );
}

function ChannelList() {
  const trpc = useTRPC();
  const channels = useSuspenseQuery(channelListQuery(trpc)).data;

  return channels.map((channel) => (
    <Link
      key={channel.id}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-50"
      activeProps={{
        className:
          'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50',
      }}
      inactiveProps={{
        className: 'text-gray-500 dark:text-gray-400',
      }}
      to="/channels/$channelId"
      params={{ channelId: channel.id }}
    >
      <HashtagIcon className="h-4 w-4 shrink-0" />
      <span className="truncate">{channel.name}</span>
    </Link>
  ));
}
