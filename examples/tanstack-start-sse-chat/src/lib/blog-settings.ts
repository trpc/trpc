import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

/**
 * The blog's settings. They are cookies, so the server sees them when it
 * renders a page as well as when the browser calls a procedure.
 */
export interface BlogSettings {
  /** Every query of the blog takes 1 to 3 seconds */
  slowQueries: boolean;
  /** When the blog's links load the page they go to, as TanStack Router's `preload` takes it */
  preload: BlogPreload;
}

export type BlogPreload = false | 'intent' | 'viewport' | 'render';

export const blogSettingsDefaults: BlogSettings = {
  slowQueries: false,
  preload: false,
};

const cookies = {
  slowQueries: 'blog-slow-queries',
  preload: 'blog-preload',
} as const;

const preloads: readonly BlogPreload[] = [
  false,
  'intent',
  'viewport',
  'render',
];

/** The value of a cookie in a `cookie` header, or `null` if it has none */
function cookieOf(header: string | null, name: string) {
  const prefix = `${name}=`;
  const found = (header ?? '')
    .split('; ')
    .find((cookie) => cookie.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

export function hasSlowQueriesCookie(header: string | null) {
  return cookieOf(header, cookies.slowQueries) === '1';
}

/** The blog's settings in a `cookie` header, or their defaults */
export function blogSettingsOf(header: string | null): BlogSettings {
  const preload = cookieOf(header, cookies.preload);
  return {
    slowQueries: hasSlowQueriesCookie(header),
    preload:
      preloads.find((value) => String(value) === preload) ??
      blogSettingsDefaults.preload,
  };
}

export const readBlogSettings = createIsomorphicFn()
  .server(() => blogSettingsOf(getRequest().headers.get('cookie')))
  .client(() => blogSettingsOf(document.cookie));

export function writeBlogSettings(settings: BlogSettings) {
  const write = (name: string, value: string) => {
    document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
  };
  write(cookies.slowQueries, settings.slowQueries ? '1' : '0');
  write(cookies.preload, String(settings.preload));
}
