import { Link } from '@tanstack/react-router';

import { buttonVariants } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';

/**
 * What a route that throws renders, in place of its own content
 * (`router.tsx`). Without a route's own boundary, TanStack Router's last one,
 * above the root route's shell, swaps the whole document, `<head>` included,
 * for "Something went wrong!", and a crawler that renders the page indexes
 * that as its title and snippet. A deploy that renames the chunks a rendered
 * page still asks for is enough to get there.
 */
export function ErrorPage() {
  return (
    <main
      className="mx-auto grid max-w-xl place-items-center content-start gap-4 px-6 py-24 text-center"
      role="alert"
    >
      <p className="font-mono text-sm text-muted-foreground">Error</p>
      <h2 className="text-3xl font-bold tracking-tight">
        This part of the page didn&apos;t load
      </h2>
      <p className="text-muted-foreground">
        The site may have just been updated; reloading usually fixes it.
      </p>
      <div className="flex gap-2">
        <button
          className={cn(buttonVariants())}
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload
        </button>
        <Link className={cn(buttonVariants({ variant: 'outline' }))} to="/">
          Home
        </Link>
      </div>
    </main>
  );
}

/** `getRouter()`'s: every route gets a boundary, inside the root's shell. */
export const errorOptions = { defaultErrorComponent: ErrorPage } as const;
