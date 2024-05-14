import type { DefaultSession, NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import GitHub from 'next-auth/providers/github';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
    };
  }
}

export const options = {
  providers: [
    GitHub({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      clientId: process.env.GITHUB_ID!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
} satisfies NextAuthOptions;

export function auth() {
  return getServerSession(options);
}
