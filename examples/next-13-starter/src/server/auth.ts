import GithubProvider from '@auth/core/providers/github';
import { NextAuthConfig, getSession } from '~/app/api/auth/[...authjs]/adapter';

declare module '@auth/core/types' {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export const authOptions: NextAuthConfig = {
  providers: [
    // @ts-expect-error - wtf??
    GithubProvider({
      clientId: process.env.GITHUB_ID as string,
      clientSecret: process.env.GITHUB_SECRET as string,
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};

/**
 * Wrapper to avoid passing authOptions to getSession everytime
 */
export const getServerSession = () => getSession(authOptions);
