import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { BlogSettings } from '~/lib/blog-settings';
import { readBlogSettings, writeBlogSettings } from '~/lib/blog-settings';
import { useTRPC } from '~/lib/trpc';
import { BlogPreloadProvider, BlogSettingsBar } from './-components/settings';

export const Route = createFileRoute('/blog')({
  loader: () => readBlogSettings(),
  component: BlogLayout,
});

function BlogLayout() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  // From the cookies, then kept here as you change them. Each load of the
  // cookies replaces it, also of a page shown from the router's cache first
  const loaded = Route.useLoaderData();
  const [settings, setSettings] = useState<BlogSettings>(loaded);
  const [seen, setSeen] = useState(loaded);
  if (loaded !== seen) {
    setSeen(loaded);
    setSettings(loaded);
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <BlogSettingsBar
          value={settings}
          onChange={(next) => {
            setSettings(next);
            writeBlogSettings(next);
            if (next.slowQueries !== settings.slowQueries) {
              // Forget what the blog has loaded, and load the page again at
              // the new speed: its loader starts its queries, in one request
              queryClient.removeQueries(trpc.blog.pathFilter());
              void router.invalidate();
            } else {
              // Only this route reads the cookies again, so the router keeps
              // no older settings to show
              void router.invalidate({
                filter: (match) => match.routeId === Route.id,
              });
            }
          }}
        />
        <BlogPreloadProvider value={settings.preload}>
          <Outlet />
        </BlogPreloadProvider>
      </main>
    </div>
  );
}
