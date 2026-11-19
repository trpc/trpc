// Relative, so `vite.config.ts` can import it for the social cards.
import { kitchenSinkPath } from '../../site.ts';

/** The kitchen sink's own page. */
export const kitchenSink = {
  description:
    'Small, working demos of tRPC features. Each one has its own tRPC server, so you can watch the requests it makes.',
  path: kitchenSinkPath,
  title: 'Kitchen sink',
} as const;

/**
 * The showcases, as the kitchen sink lists them. Each one lives in its own
 * folder beside this file, with its routes, router and components.
 */
export const showcases = [
  {
    description:
      'The server loads the page’s queries once. Components read them by handle, and the browser gets the data with the page instead of fetching it again.',
    path: '/kitchen-sink/handles',
    title: 'Handles',
  },
  {
    description:
      'Posts, their authors and the authors’ teams in one pipelined request, with experimental_nested() and a plain client. Switch pipelining off to see the requests it saves.',
    path: '/kitchen-sink/nested',
    title: 'Nested queries',
  },
  {
    description:
      'A blog whose pages load a post, its author and the author’s team’s posts, each needing the one before, in one request. A meter shows each request and when each result arrives.',
    path: '/kitchen-sink/blog',
    title: 'Blog in one request',
  },
] as const;
