import { z } from 'zod';

/**
 * The blog's settings. They are search params of the blog's pages, such as
 * `?slow=true&preload=intent`, and the blog's links keep them, so a page you
 * share or reload shows what you see.
 */
export interface BlogSettings {
  /** Every query the browser asks for takes 1 to 3 seconds */
  readonly slowQueries: boolean;
  /** When the blog's links load the page they go to, as TanStack Router's `preload` takes it */
  readonly preload: BlogPreload;
}

export type BlogPreload = false | 'intent' | 'viewport' | 'render';

export const blogSettingsDefaults: BlogSettings = {
  preload: false,
  slowQueries: false,
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
    preload: search.preload ?? blogSettingsDefaults.preload,
    slowQueries: search.slow === true,
  };
}

/** The search params of `settings`: `undefined` for a default, so its param goes */
export function blogSearchOf(settings: BlogSettings) {
  return {
    preload: settings.preload === false ? undefined : settings.preload,
    slow: settings.slowQueries ? (true as const) : undefined,
  };
}

/**
 * The header the browser sends "Slow queries" in. Its requests go to the
 * showcase's endpoint, not to the page, so they don't have its search params
 */
const slowQueriesHeader = 'x-blog-slow-queries';

/** Whether "Slow queries" is on for a request from the browser */
export function hasSlowQueries(req: Request) {
  return req.headers.get(slowQueriesHeader) === '1';
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
