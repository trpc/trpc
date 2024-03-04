import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { auth } from '~/auth';
import { headers } from 'next/headers';

export async function createContext(opts?: FetchCreateContextFnOptions) {
  const session = await auth();

  return {
    session,
    headers: opts && Object.fromEntries(opts.req.headers),
    // Mock user id which is used for testing. If you copy this file, delete the next property.
    _userIdMock: headers().get('x-trpc-user-id'),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
