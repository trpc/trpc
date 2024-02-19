'use client';

import type { AppRouter } from '~/server/routers/_app';
import { createReactClient } from './_lib/createReactClient';

const standaloneClient = createReactClient<AppRouter>();

export default function Layout(props: { children: React.ReactNode }) {
  return (
    <standaloneClient.Provider>{props.children}</standaloneClient.Provider>
  );
}
