import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { expect, test } from 'vitest';

import { validateQuerySearch } from './pages.ts';

/** What a page reads as `?q=` once the router has validated `href`. */
function searchedFor(href: string) {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [href] }),
    routeTree: createRootRoute({ validateSearch: validateQuerySearch }),
  });
  const [root] = router.matchRoutes(router.state.location);
  const search: Record<string, unknown> = root?.search ?? {};
  return search['q'];
}

test('?q= is what was searched for, numbers included', () => {
  expect(searchedFor('/?q=batching')).toBe('batching');
  expect(searchedFor('/?q=404')).toBe('404');
});

// Regression: `/search?q=null` threw `query.trim is not a function` as the
// server rendered it: the router parses `?q=` as JSON, and a value the
// route's validation left out kept what the URL said.
test("a ?q= that isn't text searches for nothing", () => {
  for (const href of ['/?q=null', '/?q=%5B1%5D', '/?q=%7B%7D']) {
    expect(searchedFor(href)).toBeUndefined();
  }
});
