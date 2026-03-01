import './global.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider';
import type { ReactNode } from 'react';
import { SearchProvider } from './search-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | tRPC',
    default: 'tRPC - Move Fast and Break Nothing',
  },
  description:
    'End-to-end typesafe APIs made easy. Move fast and break nothing.',
  icons: {
    icon: '/img/favicon.ico',
  },
  openGraph: {
    title: 'tRPC',
    description: 'End-to-end typesafe APIs made easy',
    siteName: 'tRPC',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@trpcio',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          search={{
            SearchDialog: SearchProvider,
            options: {},
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
