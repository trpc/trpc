import type { Metadata } from 'next';
import { TRPCReactProvider } from '~/trpc/client';

export const metadata: Metadata = {
  title: 'tRPC Next.js Edge Runtime',
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>{props.children}</TRPCReactProvider>
      </body>
    </html>
  );
}
