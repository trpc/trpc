import type { Metadata } from 'next';
import { TRPCReactProvider } from '~/trpc/client';
import './globals.css';

export const metadata: Metadata = {
  title: 'tRPC Next.js Minimal Starter',
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-svh bg-muted/40 antialiased">
        <TRPCReactProvider>{props.children}</TRPCReactProvider>
      </body>
    </html>
  );
}
