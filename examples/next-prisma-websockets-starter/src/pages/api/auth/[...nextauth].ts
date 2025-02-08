import NextAuth from 'next-auth';
import type { AppProviders } from 'next-auth/providers';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';

let useMockProvider =
  process.env.NODE_ENV === 'test' ||
  process.env.RAILWAY_ENVIRONMENT_NAME?.includes('-pr-'); // example: 'trpc-pr-5821'

const { GITHUB_CLIENT_ID, GITHUB_SECRET, NODE_ENV, APP_ENV } = process.env;
if (
  (NODE_ENV !== 'production' || APP_ENV === 'test') &&
  (!GITHUB_CLIENT_ID || !GITHUB_SECRET)
) {
  console.log('⚠️ Using mocked GitHub auth correct credentials were not added');
  useMockProvider = true;
}
const providers: AppProviders = [];
if (useMockProvider) {
  providers.push(
    CredentialsProvider({
      id: 'github',
      name: 'Mocked GitHub',
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
        name: { type: 'test' },
      },
    }),
  );
} else {
  if (!GITHUB_CLIENT_ID || !GITHUB_SECRET) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_SECRET must be set');
  }
  providers.push(
    GithubProvider({
      clientId: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_SECRET,
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
