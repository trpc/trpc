'use client';

import { useClerk } from '@clerk/nextjs/app-beta/client';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';

export const SignIn = ({ children }: { children: ReactNode }) => {
  const { openSignIn } = useClerk();

  return <button onClick={() => openSignIn()}>{children}</button>;
};

export const SignOut = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const { signOut } = useClerk();

  return (
    <button
      onClick={async () => {
        await signOut();
        router.push('/');
      }}
    >
      {children}
    </button>
  );
};
