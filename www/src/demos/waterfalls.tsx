import { createBlogRoutes } from './kit/blog-routes.tsx';
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
      hint="Change the page, open an article, or reload, and watch when each request starts and ends. Each one takes its own time."
      initial={props.options['variant']}
      only={props.options['variants']}
      title="Where the queries start"
      variants={[
        {
          description:
            "The route loader starts every query from the URL: the list's page, or the article's id. One round trip.",
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
            "Each component fetches what it shows. The comment counts render inside the list, and an article's comments and more by its author inside the article, so they wait. Two round trips.",
          label: 'each component',
          value: 'reader',
        },
      ]}
      variantsLabel="Start the queries in"
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
