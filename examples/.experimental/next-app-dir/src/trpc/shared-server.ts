import { auth } from '~/auth';
import { cookies, headers } from 'next/headers';

export async function createContext(source: 'invoke' | 'http') {
  return {
    session: await auth(),
    // Mock user id which is used for testing. If you copy this file, delete the next property.
    _userIdMock: headers().get('x-trpc-user-id'),
    headers: {
      cookie: cookies().toString(),
      'x-trpc-source': `rsc-${source}`,
    },
  };
}
