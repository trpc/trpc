import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

import { pageHead } from '~/seo.ts';

import { kitchenSink } from './-showcases.ts';

/**
 * The kitchen sink: small showcases of tRPC features, each in its own folder
 * here. They render on request (`build/on-demand.ts`), so their loaders run
 * on the server, and no search engine indexes them (`unindexedPaths` in
 * `src/site.ts`). Showcases validate search params with a zod schema
 * (`validateSearch`), as apps should.
 */
export const Route = createFileRoute('/kitchen-sink')({
  head: () => pageHead({ ...kitchenSink, noindex: true }),
  // Each response is rendered for its request, so nothing caches it.
  headers: () => ({ 'Cache-Control': 'no-store' }),
  component: KitchenSinkLayout,
});

function KitchenSinkLayout() {
  return (
    <main className="mx-auto grid w-full max-w-3xl grid-cols-1 content-start gap-6 px-4 py-12 sm:px-6 sm:py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link className="hover:text-foreground" to="/kitchen-sink">
          {kitchenSink.title}
        </Link>
      </nav>
      <Outlet />
    </main>
  );
}
