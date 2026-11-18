import type { Metadata } from 'next';
import 'todomvc-app-css/index.css';
import 'todomvc-common/base.css';
import { TRPCReactProvider } from '../trpc/client';

export const metadata: Metadata = {
  title: 'Todos',
  icons: '/favicon.ico',
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
