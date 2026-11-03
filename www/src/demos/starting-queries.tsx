import { createBlogRoutes } from './kit/blog-routes.tsx';
import { DemoBrowser } from './kit/browser.tsx';
import { DemoFrame } from './kit/frame.tsx';
import { staleTime } from './kit/session.tsx';
import type { DemoProps } from './names.ts';

const blogs = {
  ensure: createBlogRoutes('ensure'),
  fetch: createBlogRoutes('fetch'),
  prefetch: createBlogRoutes('prefetch'),
  reader: createBlogRoutes('reader'),
};

const code = (text: string) => <span className="font-mono">{text}</span>;

/**
 * `unstable_$prefetch`, `$ensure` and `$fetch`, in the loaders of one blog,
 * next to the same blog with no loader.
 */
export function StartingQueries(props: DemoProps) {
  return (
    <DemoFrame
      hint={`Change the page or open an article, then come back. Within ${staleTime / 1000} seconds, the page uses the cache. After that, the data is stale. Each request takes its own time, a little different on every run.`}
      initial={props.options['variant']}
      only={props.options['variants']}
      title="Start queries in a loader"
      variants={[
        {
          description:
            'The page shows at once, with skeletons until the data comes in. Stale data shows at once and refetches.',
          label: code('$prefetch'),
          value: 'prefetch',
        },
        {
          description:
            'The page waits for the data on the first visit. Stale data shows at once and refetches.',
          label: code('$ensure'),
          value: 'ensure',
        },
        {
          description:
            'The page waits for the data, and waits again for a refetch when the data is stale.',
          label: code('$fetch'),
          value: 'fetch',
        },
        {
          description:
            "Each component fetches what it shows. The comment counts render inside the list, so they can't start until it's in. Two round trips.",
          label: 'no loader',
          value: 'reader',
        },
      ]}
      variantsLabel="Start queries with"
    >
      {(run) => (
        <DemoBrowser
          initial={run.location ?? '/posts'}
          reload={run.reload}
          routeTree={blogs[run.variant]}
          session={run.session}
        />
      )}
    </DemoFrame>
  );
}
