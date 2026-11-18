import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useState } from 'react';
import type { BlogPreload } from './-components/preload';
import { BlogPreloadProvider, BlogPreloadSelect } from './-components/preload';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
});

function BlogLayout() {
  // Kept while you move between the blog's pages
  const [preload, setPreload] = useState<BlogPreload>(false);
  return (
    <div className="flex-1 overflow-y-auto">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <BlogPreloadSelect value={preload} onChange={setPreload} />
        <BlogPreloadProvider value={preload}>
          <Outlet />
        </BlogPreloadProvider>
      </main>
    </div>
  );
}
