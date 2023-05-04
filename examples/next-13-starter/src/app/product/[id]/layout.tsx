import { getServerSession } from 'next-auth/next';
import React from 'react';
import { api } from 'trpc-api';
import { authOptions } from '~/app/api/auth/[...nextauth]/opts';
import { Header } from './_components/header';

export const metadata = {
  title: 'Streaming (Edge Runtime)',
};

export default async function Layout(props: { children: React.ReactNode }) {
  // const user = await api.me.query();
  const user = (await getServerSession(authOptions))?.user;

  return (
    <div className="space-y-10">
      {/** @ts-expect-error Async Server Component */}
      <Header user={user} />

      {props.children}
    </div>
  );
}
