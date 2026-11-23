'use client';

import { SessionProvider } from 'next-auth/react';
import { TRPCReactProvider } from '~/trpc/client';

export function Providers(
  props: Readonly<{ children: React.ReactNode; wsUrl: string }>,
) {
  return (
    // Reads the session in the browser: with the session in the first HTML,
    // the form shows before React hydrates, and what's typed there is lost
    <SessionProvider>
      <TRPCReactProvider wsUrl={props.wsUrl}>
        {props.children}
      </TRPCReactProvider>
    </SessionProvider>
  );
}
