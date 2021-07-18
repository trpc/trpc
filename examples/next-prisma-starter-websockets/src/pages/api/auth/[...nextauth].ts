import NextAuth from 'next-auth';
import Providers, { AppProviders } from 'next-auth/providers';

let useMockProvider = process.env.NODE_ENV === 'test';
const { GITHUB_CLIENT_ID, GITHUB_SECRET, NODE_ENV, APP_ENV } = process.env;
if (
  (NODE_ENV !== 'production' || APP_ENV === 'test') &&
  (!GITHUB_CLIENT_ID || !GITHUB_SECRET)
) {
  console.log('⚠️ Using mocked GitHub auth correct credentails were not added');
  useMockProvider = true;
}
const providers: AppProviders = [];
if (useMockProvider) {
  providers.push(
    Providers.Credentials({
      id: 'github',
      name: 'Mocked GitHub',
      async authorize(credentials) {
        const user = {
          id: credentials.name,
          name: credentials.name,
          email: credentials.name,
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
    Providers.GitHub({
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
