import { Link } from '@tanstack/react-router';

import { buttonVariants } from '@shared/ui/components/button';
import { v11Docs } from '~/content/docs.ts';
import { cn } from '@shared/ui/lib/utils';

export function NotFound() {
  return (
    <main className="mx-auto grid max-w-xl place-items-center content-start gap-4 px-6 py-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-bold tracking-tight">
        No procedure at this path
      </h1>
      <p className="text-muted-foreground">
        The page may have moved; the docs are a search away.
      </p>
      <div className="flex gap-2">
        <Link
          className={cn(buttonVariants())}
          params={{ _splat: v11Docs.firstDoc }}
          to={v11Docs.route}
        >
          Read the docs
        </Link>
        <Link className={cn(buttonVariants({ variant: 'outline' }))} to="/">
          Home
        </Link>
      </div>
    </main>
  );
}
