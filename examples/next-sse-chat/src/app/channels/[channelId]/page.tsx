import { HashtagIcon } from '@heroicons/react/24/outline';
import { CreateChannelDialog } from '~/app/channels/create-channel';
import { Button } from '~/components/button';
import { auth, SignedIn, SignedOut, signIn, signOut } from '~/server/auth';
import { caller } from '~/server/routers/_app';
import { cx } from 'class-variance-authority';
import Link from 'next/link';
import { Suspense } from 'react';
import { Chat } from './chat';

export default async function Home(
  props: Readonly<{ params: { channelId: string } }>,
) {
  const channelId = props.params.channelId;
  const session = await auth();

  return <Chat session={session} channelId={channelId} />;
}
