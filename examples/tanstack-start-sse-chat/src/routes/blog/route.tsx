import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import { readSlowQueries } from '~/lib/slow-queries';
import type { BlogPreload } from './-components/settings';
import { BlogPreloadProvider, BlogSettings } from './-components/settings';

export const Route = createFileRoute('/blog')({
  loader: () => ({ slowQueries: readSlowQueries() }),
  component: BlogLayout,
});

function BlogLayout() {
  const { slowQueries } = Route.useLoaderData();
  // Kept while you move between the blog's pages
  const [preload, setPreload] = useState<BlogPreload>(false);
  return (
    <div className="flex-1 overflow-y-auto">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <BlogSettings
          slowQueries={slowQueries}
          preload={preload}
          onPreloadChange={setPreload}
        />
        <BlogPreloadProvider value={preload}>
          <Outlet />
        </BlogPreloadProvider>
      </main>
    </div>
  );
}
