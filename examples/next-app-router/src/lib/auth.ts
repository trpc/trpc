import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '~/db/client';
import NextAuth, { DefaultSession } from 'next-auth';
import { authConfig } from './auth.config';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
  auth,
} = NextAuth({
  adapter: DrizzleAdapter(db) as any,
  session: { strategy: 'jwt' },
  ...authConfig,
});
