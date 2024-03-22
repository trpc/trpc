import './globals.css';
import { ThemeProvider } from '@juliusmarminge/next-themes';
import { cn } from '~/lib/cn';
import { TRPCReactProvider } from '~/trpc/react';
import { Toaster } from '~/ui/sonner';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';

export const metadata = {
  title: 'Next.js App Router x tRPC',
  description: 'Next.js App Router x tRPC',
  icons: [{ rel: 'icon', url: '/favicon.ico' }],
} satisfies Metadata;

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
} satisfies Viewport;

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'bg-background text-foreground min-h-screen font-sans antialiased',
          GeistSans.variable,
        )}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
