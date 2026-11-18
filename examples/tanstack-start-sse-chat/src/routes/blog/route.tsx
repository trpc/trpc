import { useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  retainSearchParams,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import {
  blogSearchKeys,
  blogSearchOf,
  blogSearchSchema,
  blogSettingsOf,
  setSlowQueries,
} from '~/lib/blog-settings';
import { useTRPC } from '~/lib/trpc';
import { RequestMeter } from './-components/request-meter';
import { BlogPreloadProvider, BlogSettingsBar } from './-components/settings';

export const Route = createFileRoute('/blog')({
  validateSearch: blogSearchSchema,
  // Every link inside the blog keeps its settings
  search: { middlewares: [retainSearchParams([...blogSearchKeys])] },
  // Runs before the loaders below it start their queries, so those queries,
  // and the ones a preload starts, ask for the speed in the URL they load
  beforeLoad: ({ search }) => {
    setSlowQueries(search.slow === true);
  },
  component: BlogLayout,
});

function BlogLayout() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const settings = blogSettingsOf(Route.useSearch());
  return (
    <div className="flex-1 overflow-y-auto">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <BlogSettingsBar
          value={settings}
          onChange={(next) => {
            const slowChanged = next.slowQueries !== settings.slowQueries;
            if (slowChanged) {
              // Forget what the blog has loaded: the page loads again at the
              // new speed, and its loader starts its queries, in one request
              queryClient.removeQueries(trpc.blog.pathFilter());
            }
            void navigate({
              to: '.',
              search: (prev) => ({ ...prev, ...blogSearchOf(next) }),
              replace: true,
            }).then(() => (slowChanged ? router.invalidate() : undefined));
          }}
        />
        <RequestMeter />
        <BlogPreloadProvider value={settings.preload}>
          <Outlet />
        </BlogPreloadProvider>
      </main>
    </div>
  );
}
