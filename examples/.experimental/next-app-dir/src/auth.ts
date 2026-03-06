import type { DefaultSession } from 'next-auth';
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { cache } from 'react';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
    };
  }
}

export const { auth: uncachedAuth, handlers } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,

      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    session: async ({ session, token }) => {
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    // @TODO
    // authorized({ request, auth }) {
    //   return !!auth?.user
    // }
  },
});

export const auth = cache(uncachedAuth);
