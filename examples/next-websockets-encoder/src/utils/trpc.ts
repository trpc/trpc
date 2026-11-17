import type { TRPCLink } from '@trpc/client';
import { createWSClient, httpBatchLink, wsLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '~/server/routers/_app';
import { msgpackEncoder } from './encoder';

const WS_URL = 'ws://localhost:3001';
const APP_URL = 'http://localhost:3000';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function getEndingLink(): TRPCLink<AppRouter> {
  if (typeof window === 'undefined') {
    // `_app` also renders on the server, but pages prefetch there by calling
    // the router in `getServerSideProps`, so this link is never used. It just
    // keeps the server from opening a WebSocket.
    return httpBatchLink({ url: `${APP_URL}/api/trpc` });
  }

  const client = createWSClient({
    url: WS_URL,
    experimental_encoder: msgpackEncoder,
  });

  return wsLink({ client });
}
