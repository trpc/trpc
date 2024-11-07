import { HashtagIcon } from '@heroicons/react/24/outline';
import { CreateChannelDialog } from '~/app/channels/create-channel';
import { Button } from '~/components/button';
import { auth, SignedIn, SignedOut, signIn, signOut } from '~/server/auth';
import { caller } from '~/server/routers/_app';
import { cx } from 'class-variance-authority';
import Link from 'next/link';
import { Suspense } from 'react';

export default async function Home(
  props: Readonly<{
    params: Promise<{ channelId: string }>;
    children: React.ReactNode;
  }>,
) {
  const { channelId } = await props.params;
  const session = await auth();
  const channels = await caller.channel.list();

  return (
    <div className="flex flex-1 overflow-hidden">
      <nav className="hidden w-64 flex-col border-r bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:flex">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <HashtagIcon className="size-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium">Channels</span>
          </div>
          <Suspense>
            <SignedIn>
              <CreateChannelDialog />
            </SignedIn>
          </Suspense>
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {channels.map((channel) => (
            <Link
              key={channel.id}
              className={cx(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50',
                channel.id === channelId &&
                  'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50',
              )}
              href={`/channels/${channel.id}`}
            >
              <HashtagIcon className="h-4 w-4" />
              {channel.name}
            </Link>
          ))}
        </div>
        <div className="mt-auto">
          <div className="flex items-center justify-between">
            <Suspense>
              <SignedIn>
                <span className="text-sm font-medium">
                  Hello, {session?.user?.name} 👋
                </span>
                <form
                  action={async () => {
                    'use server';
                    await signOut();
                  }}
                >
                  <Button type="submit" size="sm">
                    Sign Out
                  </Button>
                </form>
              </SignedIn>
              <SignedOut>
                <form
                  className="w-full"
                  action={async () => {
                    'use server';
                    await signIn();
                  }}
                >
                  <Button type="submit" size="sm" className="w-full">
                    Sign In
                  </Button>
                </form>
              </SignedOut>
            </Suspense>
          </div>
        </div>
      </nav>
      {props.children}
    </div>
  );
}
