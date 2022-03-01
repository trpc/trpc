import NextAuth from 'next-auth';
import { AppProviders } from 'next-auth/providers';
import GithubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';

let useMockProvider = process.env.NODE_ENV === 'test';
if (
  (process.env.NODE_ENV !== 'production' || process.env.APP_ENV === 'test') &&
  (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_SECRET)
) {
  console.log('⚠️ Using mocked GitHub auth correct credentails were not added');
  useMockProvider = true;
}
const providers: AppProviders = [];
if (useMockProvider) {
  providers.push(
    CredentialsProvider({
      id: 'github',
      name: 'Mocked GitHub',
      async authorize(credentials) {
        const user = {
          id: credentials?.name,
          name: credentials?.name,
          email: credentials?.name,
        };
        return user;
      },
      credentials: {
        name: { type: 'test' },
      },
    }),
  );
} else {
  providers.push(
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_SECRET,
      profile(profile) {
        return {
          id: profile.id,
          name: profile.login,
          email: profile.email,
          image: profile.avatar_url,
        } as any;
      },
    }),
  );
}
export default NextAuth({
  // Configure one or more authentication providers
  providers,
});
