import { buttonVariants } from '@shared/ui/components/button';
import { CodeXmlIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'tRPC × Next.js App Router',
  description: "tRPC's experimental Next.js App Router integrations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-svh flex-col bg-muted/40 antialiased">
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-4 px-6">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="text-brand">tRPC</span> × Next.js App Router
            </Link>
            <a
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              href="https://github.com/trpc/trpc/tree/main/examples/.experimental/next-app-dir"
              target="_blank"
              rel="noreferrer"
            >
              <CodeXmlIcon />
              Source
            </a>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
          {children}
        </main>
        <Toaster
          toastOptions={{
            style: {
              background: 'var(--popover)',
              color: 'var(--popover-foreground)',
              border: '1px solid var(--border)',
              fontSize: '0.875rem',
            },
          }}
        />
      </body>
    </html>
  );
}
