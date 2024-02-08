import { auth } from '~/auth';
import { cookies } from 'next/headers';

export async function createContext() {
  return {
    session: await auth(),
    headers: {
      cookie: cookies().toString(),
      'x-trpc-source': 'rsc-invoke',
    },
  };
}
