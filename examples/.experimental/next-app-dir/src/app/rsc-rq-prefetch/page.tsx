import { HydrateClient, trpc } from '~/trpc/rq-server';
import React from 'react';
import { Post } from './post';

export default function Home() {
  void trpc.getPokemon.prefetch({ id: 25 });

  return (
    <main>
      <h1>Latest Post</h1>
      <HydrateClient>
        <Post />
      </HydrateClient>
    </main>
  );
}
