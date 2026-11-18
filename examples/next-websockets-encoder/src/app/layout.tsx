import type { Metadata } from 'next';
import { TRPCReactProvider } from '~/trpc/client';
import './globals.css';

export const metadata: Metadata = {
  title: 'tRPC WebSocket + MessagePack Encoder',
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
