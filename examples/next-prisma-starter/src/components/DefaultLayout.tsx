import { buttonVariants } from '@shared/ui/components/button';
import { BookOpenIcon } from 'lucide-react';
import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';

type DefaultLayoutProps = { children: ReactNode };

export const DefaultLayout = ({ children }: DefaultLayoutProps) => {
  return (
    <>
      <Head>
        <title>Prisma Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="flex min-h-svh flex-col bg-muted/40">
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <Link href="/" className="font-bold tracking-tight">
              <span className="text-brand">tRPC</span> Prisma Starter
            </Link>
            <a
              href="https://trpc.io/docs"
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              <BookOpenIcon />
              Docs
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
          {children}
        </main>

        <footer className="border-t bg-background py-6 text-center text-sm text-muted-foreground">
          Next.js pages router, tRPC, Prisma and Postgres
        </footer>
      </div>
    </>
  );
};
