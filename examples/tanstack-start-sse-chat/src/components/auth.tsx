import type { Session } from '@auth/core/types';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { sessionQuery } from '~/queries';

export function useSession() {
  return useSuspenseQuery(sessionQuery()).data;
}

export function useSignInHref() {
  const href = useLocation({ select: (location) => location.href });
  return `/api/auth/signin?${new URLSearchParams({ callbackUrl: href })}`;
}

export const signOutHref = '/api/auth/signout';

export function SignedIn(props: {
  children:
    | React.ReactNode
    | ((props: { user: NonNullable<Session['user']> }) => React.ReactNode);
}) {
  const session = useSession();
  if (!session?.user) {
    return null;
  }
  return typeof props.children === 'function'
    ? props.children({ user: session.user })
    : props.children;
}

export function SignedOut(props: { children: React.ReactNode }) {
  const session = useSession();
  return session?.user ? null : props.children;
}
