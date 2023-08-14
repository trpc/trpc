import { type DefaultSession, type NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
    };
  }
}

export const options = {
  providers: [
    CredentialsProvider({
      id: 'github',
      name: 'Super Secure Test Provider',
      async authorize(credentials) {
        if (credentials) {
          const name = credentials.name;
          return {
            id: name,
            name: name,
            email: name,
          };
        }
        return null;
      },
      credentials: {
        name: { type: 'test', label: 'Name' },
      },
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
