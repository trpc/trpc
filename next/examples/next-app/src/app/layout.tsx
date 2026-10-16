import type { ReactNode } from 'react';
import { Providers } from '../trpc/client.tsx';

export const metadata = { title: 'tRPC v12 + Next.js' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '2rem auto' }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
