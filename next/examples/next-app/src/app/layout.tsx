import type { ReactNode } from 'react';
import { Providers } from '../trpc/client.tsx';
import './globals.css';

export const metadata = { title: 'tRPC v12 + Next.js' };

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-muted/40 font-sans antialiased">
        <Providers>{props.children}</Providers>
      </body>
    </html>
  );
}
