// Relative, so `vite.config.ts` can import it for the social cards.
import { kitchenSinkPath } from '../../site.ts';

/** The kitchen sink's own page. */
export const kitchenSink = {
  description:
    'Small, working showcases of tRPC features, each with its own server and router.',
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
      'A server loader starts the queries, components read them by handle, and the browser gets the data without fetching it again.',
    path: '/kitchen-sink/handles',
    title: 'Handles',
  },
] as const;
