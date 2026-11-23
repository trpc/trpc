import '../styles/global.css';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { vercelHost } from '~/utils/vercelHost';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'tRPC WebSocket Starter',
  icons: '/favicon.ico',
};

export default async function RootLayout(
  props: Readonly<{ children: React.ReactNode }>,
) {
  // Renders on each request, so `WS_URL` is read when the server starts, not when it's built
  await connection();
  const wsUrl = vercelHost
    ? `wss://${vercelHost}/api/trpc-ws`
    : process.env.WS_URL;
  if (!wsUrl) {
    throw new Error('WS_URL must be set');
  }

  return (
    <html lang="en">
      <body>
        <Providers wsUrl={wsUrl}>{props.children}</Providers>
      </body>
    </html>
  );
}
