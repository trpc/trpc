import {
  AuthorBlogSkeleton,
  createAuthorBlogRoutes,
} from './kit/author-blog.tsx';
import { DemoBrowser } from './kit/browser.tsx';
import { DemoFrame } from './kit/frame.tsx';
import type { DemoProps } from './names.ts';

const blogs = {
  entries: createAuthorBlogRoutes('entries'),
  reader: createAuthorBlogRoutes('reader'),
};

const code = (text: string) => <span className="font-mono">{text}</span>;

/**
 * A page where each query needs the one before it, loaded two ways: by the
 * components, one round trip at a time, and by a loader that names every
 * query up front, in one request. `start=list` opens the list, where every
 * row has a query of its own.
 */
export function DependentQueries(props: DemoProps) {
  const list = props.options['start'] === 'list';
  return (
    <DemoFrame
      hint={
        list
          ? 'Each row shows its author, who is another query. Reload, or open another page of the list, and watch the network. Slow latency makes the difference plain.'
          : 'The author card needs the post, and the list under it needs the author. Reload, or open another article, and watch the network. Slow latency makes the difference plain.'
      }
      initial={props.options['variant']}
      only={props.options['variants']}
      title={
        list ? 'A query for every row' : "A query that needs another's data"
      }
      transport="http"
      variants={[
        {
          description: list ? (
            <>
              The loader names the list and an author for every row. The server
              reads each {code('authorId')} from the list. One round trip, and
              each part shows when it arrives.
            </>
          ) : (
            <>
              The loader names all three queries. The server reads{' '}
              {code('authorId')} from the post, and the author&apos;s{' '}
              {code('id')} for the list. One round trip, and each part shows
              when it arrives.
            </>
          ),
          label: 'the loader',
          value: 'entries',
        },
        {
          description: list
            ? 'Each component fetches what it shows. The rows only know their authors once the list is in. Two round trips.'
            : 'Each component fetches what it shows. The author waits for the post, and the list waits for the author. Three round trips.',
          label: 'each component',
          value: 'reader',
        },
      ]}
      variantsLabel="Start the queries in"
    >
      {(run) => (
        <DemoBrowser
          initial={run.location ?? (list ? '/posts' : '/posts/1')}
          placeholder={(href) => <AuthorBlogSkeleton href={href} />}
          reload={run.reload}
          routeTree={blogs[run.variant]}
          session={run.session}
        />
      )}
    </DemoFrame>
  );
}
