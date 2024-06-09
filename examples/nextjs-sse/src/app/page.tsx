import { HashtagIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Button } from '~/components/button';
import { cn } from '~/lib/utils';
import { caller } from '~/server/routers/_app';
import Link from 'next/link';
import { CreateChannelDialog } from './create-channel';

export default async function Home() {
  const channels = await caller.channel.list();

  return (
    <div className="flex-1 overflow-y-hidden">
      <div className="flex h-full flex-col divide-gray-700">
        <header className="p-4">
          <h1 className="text-3xl font-bold text-gray-50">tRPC SSE starter</h1>
          <p className="text-sm text-gray-400">
            Showcases Server-sent Events + subscription support
            <br />
            <a
              className="text-gray-100 underline"
              href="https://github.com/trpc/trpc/tree/05-10-subscriptions-sse/examples/next-prisma-sse-subscriptions"
              target="_blank"
              rel="noreferrer"
            >
              View Source on GitHub
            </a>
          </p>
        </header>

        <article className="space-y-2 p-4 text-gray-400">
          <h2 className="text-lg font-medium text-white">Introduction</h2>
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
            <h2 className="text-lg font-medium text-white">Channels</h2>
            <CreateChannelDialog>
              <Button size="icon" className="size-8">
                <PlusIcon className="size-4" />
              </Button>
            </CreateChannelDialog>
          </div>
          {channels.map((channel) => (
            <Link
              key={channel.id}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50',
              )}
              href={`/channels/${channel.id}`}
            >
              <HashtagIcon className="h-4 w-4" />
              {channel.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
