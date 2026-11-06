import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@shared/ui/components/avatar';
import { buttonVariants } from '@shared/ui/components/button';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import { HashIcon, LogInIcon, LogOutIcon } from 'lucide-react';
import { Suspense } from 'react';
import { z } from 'zod';
import {
  SignedIn,
  SignedOut,
  signOutHref,
  useSignInHref,
} from '~/components/auth';
import { CreateChannelDialog } from '~/components/create-channel';
import { useTRPC, type TRPC } from '~/lib/trpc';
import { Chat } from './-components/chat';

export const Route = createFileRoute('/channels/$channelId')({
  beforeLoad: (opts) => {
    if (!z.string().uuid().safeParse(opts.params.channelId).success) {
      // oxlint-disable-next-line typescript/only-throw-error -- the router's not-found signal
      throw notFound();
    }
  },
  loader: async (opts) => {
    const { trpc } = opts.context;
    const [handles] = await trpc.unstable_$loadHandles({
      channels: trpc.channel.list.unstable_$prefetchEntry(),
      posts: trpc.post.infinite.unstable_$prefetchInfiniteEntry(
        { channelId: opts.params.channelId },
        { getNextPageParam: (d) => d.nextCursor },
      ),
    });
    return handles;
  },
  component: ChannelPage,
});

function ChannelPage() {
  const { channelId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const signInHref = useSignInHref();

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="hidden w-64 shrink-0 flex-col border-r bg-background sm:flex">
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <span className="text-sm font-medium">Channels</span>
          <SignedIn>
            <CreateChannelDialog />
          </SignedIn>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <Suspense>
            <ChannelList channels={loaderData.channels} />
          </Suspense>
        </div>
        <div className="border-t p-3">
          <SignedIn>
            {({ user }) => (
              <div className="flex items-center gap-3">
                <Avatar>
                  {user.image && <AvatarImage src={user.image} alt="" />}
                  <AvatarFallback className="text-xs font-medium">
                    {user.name?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">Signed in</p>
                </div>
                <a
                  href={signOutHref}
                  aria-label="Sign out"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'icon-sm',
                  })}
                >
                  <LogOutIcon />
                </a>
              </div>
            )}
          </SignedIn>
          <SignedOut>
            <a
              href={signInHref}
              className={buttonVariants({ className: 'w-full' })}
            >
              <LogInIcon />
              Sign in
            </a>
          </SignedOut>
        </div>
      </nav>
      <Suspense
        fallback={
          <div className="flex flex-1 flex-col gap-4 p-6">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-10 w-2/3 rounded-xl" />
              </div>
            ))}
          </div>
        }
      >
        <Chat
          key={channelId}
          posts={loaderData.posts}
          title={
            <Suspense>
              <ChannelName
                channels={loaderData.channels}
                channelId={channelId}
              />
            </Suspense>
          }
        />
      </Suspense>
    </div>
  );
}

type ChannelsHandle = unstable_inferQueryHandle<TRPC['channel']['list']>;

function ChannelName(
  props: Readonly<{ channels: ChannelsHandle; channelId: string }>,
) {
  const trpc = useTRPC();
  const channelsQuery = useSuspenseQuery(
    trpc.unstable_$fromHandle(props.channels),
  );
  return channelsQuery.data.find((channel) => channel.id === props.channelId)
    ?.name;
}

function ChannelList(props: Readonly<{ channels: ChannelsHandle }>) {
  const trpc = useTRPC();
  const channelsQuery = useSuspenseQuery(
    trpc.unstable_$fromHandle(props.channels),
  );

  return channelsQuery.data.map((channel) => (
    <Link
      key={channel.id}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground"
      activeProps={{
        className: 'bg-muted text-foreground',
      }}
      inactiveProps={{
        className: 'text-muted-foreground',
      }}
      to="/channels/$channelId"
      params={{ channelId: channel.id }}
    >
      <HashIcon className="size-4 shrink-0" />
      <span className="truncate">{channel.name}</span>
    </Link>
  ));
}
