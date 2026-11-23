import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DefaultLayout } from '~/components/DefaultLayout';
import { TRPCReactProvider } from '~/trpc/client';
import '~/styles/globals.css';

export const metadata: Metadata = {
  title: 'Prisma Starter',
  icons: '/favicon.ico',
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>
          <DefaultLayout>{props.children}</DefaultLayout>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
