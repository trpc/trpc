import NextAuth from 'next-auth';
import type { DefaultSession } from 'next-auth';
import GitHub from 'next-auth/providers/github';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export const {
  handlers: { GET, POST },
  auth,
  CSRF_experimental,
} = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    jwt: async ({ token, profile }) => {
      if (profile?.id) {
        token.id = profile.id;
        token.image = profile.picture;
      }
      return token;
    },
    // @TODO
    // authorized({ request, auth }) {
    //   return !!auth?.user
    // }
  },
});
