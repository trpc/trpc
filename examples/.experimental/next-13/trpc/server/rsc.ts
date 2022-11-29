import {
  HTTPHeaders,
  createTRPCProxyClient,
  httpBatchLink,
} from '@trpc/client';
import { headers } from 'next/headers';
import { clientOptions } from '../client';

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return '';
  }
  // reference for vercel.com
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // // reference for render.com
  if (process.env.RENDER_INTERNAL_HOSTNAME) {
    return `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}`;
  }

  // assume localhost
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

// Replace ending link with a link that passes the headers form RSC
const links = clientOptions.links
  .slice(0, clientOptions.links.length - 2)
  .concat([
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      headers() {
        const h: HTTPHeaders = {};
        for (const [key, value] of headers()) {
          h[key] = value;
        }
        delete h.connection;
        return h;
      },
    }),
  ]);
export const trpc = createTRPCProxyClient({
  ...clientOptions,
  links,
});
