import { httpBatchLink, splitLink } from '@trpc/client';
import { httpLinkFactory } from '@trpc/client/links/httpLink';
import { GetBody, GetUrl, Requester, httpRequest } from '@trpc/client/shared';
import { createTRPCNext } from '@trpc/next';
import { AppRouter } from '../pages/api/trpc/[trpc]';

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // In the browser, we return a relative URL
    return '';
  }
  // When rendering on the server, we return an absolute URL

  // reference for vercel.com
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // assume localhost
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const getUrl: GetUrl = (opts) => {
  const url = opts.url + '/' + opts.path;
  const queryParts: string[] = [];

  const input = 'input' in opts ? opts.input : undefined;

  if (opts.type === 'query') {
    if (input !== undefined) {
      queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
    }
  }

  return url;
};

export const getBody: GetBody = (opts) => {
  if (opts.type === 'query') {
    return undefined;
  }
  const input = ('input' in opts ? opts.input : undefined) as
    | FormData
    | undefined;
  return input;
};

export const formDataRequester: Requester = (opts) => {
  return httpRequest({
    ...opts,
    getUrl,
    getBody,
  });
};

export const formDataLink = httpLinkFactory({ requester: formDataRequester });

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [
        splitLink({
          condition(op) {
            return op.input instanceof FormData;
          },
          true: formDataLink({
            url: getBaseUrl() + '/api/trpc',
          }),
          false: httpBatchLink({
            url: getBaseUrl() + '/api/trpc',
          }),
        }),
      ],
    };
  },
  ssr: false,
});
