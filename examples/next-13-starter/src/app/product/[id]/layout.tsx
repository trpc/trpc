import React from 'react';
import { api } from 'trpc-api';
import { Header } from './(components)/header';

export const metadata = {
  title: 'Streaming (Edge Runtime)',
};

export default async function Layout(props: { children: React.ReactNode }) {
  const user = await api.me.query();

  return (
    <div className="space-y-10">
      {/** @ts-expect-error Async Server Component */}
      <Header user={user} />

      {props.children}
    </div>
  );
}
