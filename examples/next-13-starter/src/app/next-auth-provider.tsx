'use client';

import { SessionProvider } from 'next-auth/react';
import { type ReactNode } from 'react';

export default function NextAuthProvider(props: { children: ReactNode }) {
  return <SessionProvider>{props.children}</SessionProvider>;
}
