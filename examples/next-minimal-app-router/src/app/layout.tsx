import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TRPCReactProvider } from '~/trpc/client';

export const metadata: Metadata = {
  title: 'tRPC + Next.js App Router',
  description: 'A minimal example of tRPC with the Next.js App Router',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
