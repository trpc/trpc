import type { ReactNode } from 'react';
import { Providers } from '../trpc/client.tsx';

export const metadata = { title: 'tRPC v12 + Next.js' };

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '2rem auto' }}
      >
        <Providers>{props.children}</Providers>
      </body>
    </html>
  );
}
