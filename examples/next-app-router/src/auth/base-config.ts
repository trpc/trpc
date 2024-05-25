import type { DefaultSession, NextAuthConfig, Session } from 'next-auth';
import Github from 'next-auth/providers/github';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
    };
  }
}

export const authConfig = {
  session: { strategy: 'jwt' },
  providers: [Github],
  pages: { signIn: '/' },
  callbacks: {
    session: async (opts) => {
      if (!('token' in opts)) throw 'unreachable with jwt strategy';
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
