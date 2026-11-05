import { createBlogRoutes, PageSkeleton } from './kit/blog-routes.tsx';
import { DemoBrowser } from './kit/browser.tsx';
import { DemoFrame } from './kit/frame.tsx';
import type { DemoProps } from './names.ts';

const blogs = {
  loader: createBlogRoutes('prefetch'),
  reader: createBlogRoutes('reader'),
  top: createBlogRoutes('top'),
};

/** Where queries start, and the waterfall you get if they start where they're read. */
export function Waterfalls(props: DemoProps) {
  return (
    <DemoFrame
      hint="Reload, open all posts, or open another article, and watch when each request starts and ends. Each one takes its own time."
      initial={props.options['variant']}
      only={props.options['variants']}
      title="Where the queries start"
      variants={[
        {
          description:
            "The route loader starts every query from the URL: the article's id, or the list's page. One round trip.",
          label: 'the loader',
          value: 'loader',
        },
        {
          description:
            'Each page starts its queries as it renders, and passes the handles down. One round trip, a little later.',
          label: 'the page',
          value: 'top',
        },
        {
          description:
            "Each component fetches what it shows. An article's comments and more by its author render inside the article, so they wait for it. Two round trips.",
          label: 'each component',
          value: 'reader',
        },
      ]}
      variantsLabel="Start the queries in"
    >
      {(run) => (
        <DemoBrowser
          initial={run.location ?? '/posts/1'}
          placeholder={(href) => <PageSkeleton href={href} />}
          reload={run.reload}
          routeTree={blogs[run.variant]}
          session={run.session}
        />
      )}
    </DemoFrame>
  );
}
