import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

/**
 * The blog's "Slow queries" switch. It is a cookie, so the server sees it
 * when it renders a page as well as when the browser calls a procedure.
 */
const COOKIE = 'blog-slow-queries';

export function hasSlowQueriesCookie(cookies: string | null) {
  return (cookies ?? '').split('; ').includes(`${COOKIE}=1`);
}

export const readSlowQueries = createIsomorphicFn()
  .server(() => hasSlowQueriesCookie(getRequest().headers.get('cookie')))
  .client(() => hasSlowQueriesCookie(document.cookie));

export function writeSlowQueries(on: boolean) {
  document.cookie = `${COOKIE}=${on ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
}
