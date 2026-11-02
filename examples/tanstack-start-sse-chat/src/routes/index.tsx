import { Badge } from '@shared/ui/components/badge';
import { buttonVariants } from '@shared/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@shared/ui/components/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@shared/ui/components/item';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { unstable_inferQueryHandle } from '@trpc/tanstack-react-query';
import {
  ChevronRightIcon,
  HashIcon,
  KeyboardIcon,
  LogInIcon,
  NetworkIcon,
  RadioIcon,
} from 'lucide-react';
import { Suspense } from 'react';
import { SignedIn, SignedOut, useSignInHref } from '~/components/auth';
import { CreateChannelDialog } from '~/components/create-channel';
import { useTRPC, type TRPC } from '~/lib/trpc';

export const Route = createFileRoute('/')({
  loader: (opts) => ({
    channels: opts.context.trpc.channel.list.unstable_$prefetch(),
  }),
  component: Home,
});

function Home() {
  const loaderData = Route.useLoaderData();
  const signInHref = useSignInHref();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
        <section className="flex flex-col items-start gap-4">
          <Badge variant="secondary">Server-sent Events</Badge>
          <h1 className="text-4xl font-bold tracking-tight">tRPC SSE Chat</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            A chat on TanStack Start where new messages and typing indicators
            arrive through tRPC subscriptions over Server-sent Events.
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <NetworkIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  Open the inspector&apos;s Network tab: every request goes over
                  HTTP, and subscriptions are EventStream responses
                </span>
              </li>
              <li className="flex gap-3">
                <RadioIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  <code>post.onAdd</code> adds new messages as they&apos;re
                  posted, and resumes from the last event id after a reconnect
                </span>
              </li>
              <li className="flex gap-3">
                <KeyboardIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  <code>channel.whoIsTyping</code> shows who&apos;s writing in
                  each channel
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channels</CardTitle>
            <CardDescription>Pick one to start chatting.</CardDescription>
            <CardAction>
              <SignedIn>
                <CreateChannelDialog />
              </SignedIn>
              <SignedOut>
                <a href={signInHref} className={buttonVariants()}>
                  <LogInIcon />
                  Sign in
                </a>
              </SignedOut>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Suspense
              fallback={
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              }
            >
              <ChannelList channels={loaderData.channels} />
            </Suspense>
          </CardContent>
        </Card>
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

  if (channelsQuery.data.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No channels yet</EmptyTitle>
          <EmptyDescription>
            Sign in and create the first one with the + button.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="-mx-3">
      {channelsQuery.data.map((channel) => (
        <Item
          key={channel.id}
          size="sm"
          render={
            <Link
              to="/channels/$channelId"
              params={{ channelId: channel.id }}
            />
          }
        >
          <ItemMedia variant="icon">
            <HashIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="truncate">{channel.name}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
