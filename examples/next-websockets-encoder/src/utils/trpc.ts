import type { TRPCLink } from '@trpc/client';
import {
  createWSClient,
  httpBatchLink,
  loggerLink,
  wsLink,
} from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import type { AppRouter } from '~/server/routers/_app';
import type { NextPageContext } from 'next';
import { msgpackEncoder } from './encoder';

const WS_URL = 'ws://localhost:3001';
const APP_URL = 'http://localhost:3000';

function getEndingLink(ctx: NextPageContext | undefined): TRPCLink<AppRouter> {
  if (typeof window === 'undefined') {
    return httpBatchLink({
      url: `${APP_URL}/api/trpc`,
      headers() {
        if (!ctx?.req?.headers) {
          return {};
        }
        return { ...ctx.req.headers, 'x-ssr': '1' };
      },
    });
  }

  const client = createWSClient({
    url: WS_URL,
    experimental_encoder: msgpackEncoder,
  });

  return wsLink({ client });
}

export const trpc = createTRPCNext<AppRouter>({
  ssr: true,
  ssrPrepass,
  config({ ctx }) {
    return {
      links: [loggerLink({ enabled: () => true }), getEndingLink(ctx)],
    };
  },
});
