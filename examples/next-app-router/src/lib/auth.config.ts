import type { DefaultSession, NextAuthConfig } from 'next-auth';
import Github from 'next-auth/providers/github';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export const authConfig = {
  providers: [Github],
  callbacks: {
    session: async (opts) => {
      if (!('token' in opts)) throw 'unreachable wihtout db strategy';
      const { session, token } = opts;

      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub,
        },
      };
    },
  },
} satisfies NextAuthConfig;
