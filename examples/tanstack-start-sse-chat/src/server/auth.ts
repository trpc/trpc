import { Auth, createActionURL, setEnvDefaults } from '@auth/core';
import CredentialsProvider from '@auth/core/providers/credentials';
import GithubProvider from '@auth/core/providers/github';
import type { AuthConfig, Session } from '@auth/core/types';
import { z } from 'zod';

export const authConfig: AuthConfig = {
  basePath: '/api/auth',
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [],
};

let useMockProvider =
  process.env.NODE_ENV === 'test' || process.env.VERCEL_ENV === 'preview';

const { AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, NODE_ENV, APP_ENV } = process.env;
if (
  (NODE_ENV !== 'production' || APP_ENV === 'test') &&
  (!AUTH_GITHUB_ID || !AUTH_GITHUB_SECRET)
) {
  console.log('⚠️ Using mocked GitHub auth correct credentials were not added');
  useMockProvider = true;
}

if (useMockProvider) {
  authConfig.providers.push(
    CredentialsProvider({
      id: 'github',
      name: 'Mocked GitHub',
      async authorize(input) {
        const credentials = z
          .object({
            name: z.string(),
          })
          .parse(input);

        const name = credentials.name;
        return {
          id: name,
          name: name,
          email: name,
        };
      },
      credentials: {
        name: { type: 'test' },
      },
    }),
  );
} else {
  authConfig.providers.push(
    GithubProvider({
      profile: (login) => ({
        id: String(login.id),
        name: login.login,
        email: login.email,
        image: login.avatar_url,
      }),
    }),
  );
}

setEnvDefaults(process.env, authConfig);

export function handleAuthRequest(request: Request) {
  return Auth(request, authConfig);
}

export async function getSession(request: Request): Promise<Session | null> {
  const url = createActionURL(
    'session',
    new URL(request.url).protocol,
    request.headers,
    process.env,
    authConfig,
  );
  const response = await Auth(
    new Request(url, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
    }),
    authConfig,
  );
  const session: Session | null = await response.json();
  return session?.user ? session : null;
}
