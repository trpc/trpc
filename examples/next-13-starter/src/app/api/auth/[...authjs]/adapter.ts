import { Auth } from '@auth/core';
import { AuthAction, AuthConfig, Session } from '@auth/core/types';
import { serialize } from 'cookie';
import {
  parseString,
  splitCookiesString,
  type Cookie,
} from 'set-cookie-parser';

export interface NextAuthConfig extends AuthConfig {
  /**
   * Defines the base path for the auth routes.
   * @default '/api/auth'
   */
  prefix?: string;
}

const actions: AuthAction[] = [
  'providers',
  'session',
  'csrf',
  'signin',
  'signout',
  'callback',
  'verify-request',
  'error',
];

// currently multiple cookies are not supported, so we keep the next-auth.pkce.code_verifier cookie for now:
// because it gets updated anyways
// src: https://github.com/solidjs/solid-start/issues/293
const getSetCookieCallback = (cook?: string | null): Cookie | undefined => {
  if (!cook) return;
  const splitCookie = splitCookiesString(cook);
  for (const cookName of [
    '__Secure-next-auth.session-token',
    'next-auth.session-token',
    'next-auth.pkce.code_verifier',
    '__Secure-next-auth.pkce.code_verifier',
  ]) {
    const temp = splitCookie.find((e) => e.startsWith(`${cookName}=`));
    if (temp) {
      return parseString(temp);
    }
  }
  return parseString(splitCookie?.[0] ?? ''); // just return the first cookie if no session token is found
};

export async function NextAuthHandler(
  request: Request,
  context: { params: { authjs: string[] } },
  authOptions: NextAuthConfig,
) {
  const action = context.params.authjs[0];
  if (!actions.includes(action as AuthAction)) return;

  const res = await Auth(request, authOptions);

  if (['callback', 'signin', 'signout'].includes(action)) {
    const parsedCookie = getSetCookieCallback(
      res.clone().headers.get('Set-Cookie'),
    );
    if (parsedCookie) {
      res.headers.set(
        'Set-Cookie',
        serialize(parsedCookie.name, parsedCookie.value, parsedCookie as any),
      );
    }
  }
  return res;
}

export async function getSession(
  options: NextAuthConfig,
): Promise<Session | null> {
  options.secret ??= process.env.NEXTAUTH_SECRET;
  options.trustHost ??= !!(
    process.env.AUTH_TRUST_HOST ??
    process.env.VERCEL ??
    process.env.NODE_ENV !== 'production'
  );

  const { headers } = await import('next/headers');

  const baseUrl = process.env.VERCEL
    ? 'https://' + process.env.VERCEL_URL
    : process.env.NEXTAUTH_URL;

  const url = new URL('/api/auth/session', baseUrl);
  const response = await Auth(
    new Request(url, { headers: headers() }),
    options,
  );

  const { status = 200 } = response;
  const data = await response.json();

  if (!data || !Object.keys(data).length) return null;
  if (status === 200) return data;
  throw new Error(data.message);
}
