import {
  AuthorBlogSkeleton,
  createAuthorBlogRoutes,
} from './kit/author-blog.tsx';
import { DemoBrowser } from './kit/browser.tsx';
import { DemoFrame } from './kit/frame.tsx';
import type { DemoProps } from './names.ts';

const blogs = {
  pipelined: createAuthorBlogRoutes('pipelined'),
  waterfall: createAuthorBlogRoutes('waterfall'),
};

const code = (text: string) => <span className="font-mono">{text}</span>;

/**
 * A page where each query needs the one before it, loaded two ways: as a
 * waterfall, where the browser asks again each time it learns an id, and in
 * one request, where the server fills in the ids. `start=list` opens the
 * list, where every row has a query of its own.
 */
export function DependentQueries(props: DemoProps) {
  const list = props.options['start'] === 'list';
  return (
    <DemoFrame
      hint={
        <>
          Reload, or open another {list ? 'page of the list' : 'article'}, and
          watch the network. Each number is a request the browser sends. The
          dark sliver in a bar is the server&apos;s work, and the rest is the
          trip there and back. Try a slow connection: only the trips grow.
        </>
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
              The browser asks for the list. When it has the list, it asks for
              the author of each row. Two round trips, one after the other.
            </>
          ) : (
            <>
              The browser asks for the post. When it has the post, it asks for
              the author. When it has the author, it asks for the author&apos;s
              posts. Three round trips, one after the other.
            </>
          ),
          label: 'a waterfall',
          value: 'waterfall',
        },
        {
          description: list ? (
            <>
              The browser asks for the list and an author for every row at once.
              The server reads each {code('authorId')} from the list. One round
              trip, and each part shows when it arrives.
            </>
          ) : (
            <>
              The browser asks for all three at once, with a blank where each id
              goes. The server fills in {code('authorId')} from the post, and
              the author&apos;s {code('id')} for the list. One round trip, and
              each part shows when it arrives.
            </>
          ),
          label: 'one request',
          value: 'pipelined',
        },
      ]}
      variantsLabel="Load the page with"
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
