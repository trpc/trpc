import { z } from 'zod';

/**
 * The blog's settings. They are search params of the blog's pages, such as
 * `/blog?slow=true&preload=intent`, and the blog's links keep them, so a page
 * you share or reload shows what you see.
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

/**
 * The blog's search params. One that is left out is its default, and one with
 * a value the blog doesn't know is left out too
 */
export const blogSearchSchema = z.object({
  slow: z.literal(true).optional().catch(undefined),
  preload: z.enum(['intent', 'viewport', 'render']).optional().catch(undefined),
});

export type BlogSearch = z.infer<typeof blogSearchSchema>;

/** The search params the blog keeps across its links */
export const blogSearchKeys = blogSearchSchema.keyof().options;

export function blogSettingsOf(search: BlogSearch): BlogSettings {
  return {
    slowQueries: search.slow === true,
    preload: search.preload ?? blogSettingsDefaults.preload,
  };
}

/** The search params of `settings`: `undefined` for a default, so its param goes */
export function blogSearchOf(settings: BlogSettings): BlogSearch {
  return {
    slow: settings.slowQueries ? (true as const) : undefined,
    preload: settings.preload === false ? undefined : settings.preload,
  };
}

/**
 * The header the browser sends "Slow queries" in. Its requests go to
 * `/api/trpc`, not to the page, so they don't have the page's search params
 */
const slowQueriesHeader = 'x-blog-slow-queries';

/**
 * Whether "Slow queries" is on for a request: in the header of one from the
 * browser, or in the URL of a page the server renders
 */
export function hasSlowQueries(req: Request) {
  return (
    req.headers.get(slowQueriesHeader) === '1' ||
    new URL(req.url).searchParams.get('slow') === 'true'
  );
}

/**
 * In the browser, what the blog's route last read from its search params.
 * `null` until it runs, when the page's URL has them
 */
let slowQueries: boolean | null = null;

/** Called by the blog's route before its loaders start their queries */
export function setSlowQueries(on: boolean) {
  slowQueries = on;
}

/** The headers of a request from the browser */
export function slowQueriesHeaders(): Record<string, string> {
  const on =
    slowQueries ??
    new URL(window.location.href).searchParams.get('slow') === 'true';
  return on ? { [slowQueriesHeader]: '1' } : {};
}
