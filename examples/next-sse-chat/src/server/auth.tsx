import type { NextAuthConfig, Session } from 'next-auth';
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';
import { cache } from 'react';
import { z } from 'zod';

const authOptions: NextAuthConfig = {
  providers: [],
};

let useMockProvider =
  process.env.NODE_ENV === 'test' ||
  process.env.RAILWAY_ENVIRONMENT_NAME?.includes('-pr-'); // example: 'trpc-pr-5821'

const { AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, NODE_ENV, APP_ENV } = process.env;
if (
  (NODE_ENV !== 'production' || APP_ENV === 'test') &&
  (!AUTH_GITHUB_ID || !AUTH_GITHUB_SECRET)
) {
  console.log('⚠️ Using mocked GitHub auth correct credentials were not added');
  useMockProvider = true;
}

if (useMockProvider) {
  authOptions.providers.push(
    CredentialsProvider({
      id: 'github',
      name: 'Mocked GitHub',
      async authorize(input) {
        const credentials = z
          .object({
            name: z.string(),
          })
          .parse(input);

        const name = credentials.name;
        return {
          id: name,
          name: name,
          email: name,
        };
      },
      credentials: {
        name: { type: 'test' },
      },
    }),
  );
} else {
  authOptions.providers.push(
    GithubProvider({
      profile: (login) => ({
        id: String(login.id),
        name: login.login,
        email: login.email,
        image: login.avatar_url,
      }),
    }),
  );
}

export const {
  handlers,
  auth: uncachedAuth,
  signIn,
  signOut,
} = NextAuth(authOptions);

export const auth = cache(uncachedAuth);

export async function SignedIn(props: {
  children:
    | React.ReactNode
    | ((props: { user: Session['user'] }) => React.ReactNode);
}) {
  const sesh = await auth();
  return sesh?.user ? (
    <>
      {typeof props.children === 'function'
        ? props.children({ user: sesh.user })
        : props.children}
    </>
  ) : null;
}

export async function SignedOut(props: { children: React.ReactNode }) {
  const sesh = await auth();
  return sesh?.user ? null : <>{props.children}</>;
}
