import NextAuth from 'next-auth';
import Providers, { AppProviders } from 'next-auth/providers';
import { env } from 'server/env';

const providers: AppProviders = [];

if (env.APP_ENV === 'test') {
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
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_SECRET,
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
