import { httpBatchLink } from '@trpc/client';
import { trpc } from './trpc';

/**
 * We are using this file on purpose (and not through `useState` as shown in
 * the documentation), since we want to demonstrate what was written on the
 * custom headers documentation page.
 */

let token: string;

export function setToken(newToken: string) {
  token = newToken;
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:2022',
      headers() {
        return { Authorization: token };
      },
    }),
  ],
});
