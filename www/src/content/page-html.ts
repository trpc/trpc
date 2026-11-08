/**
 * Pages' prerendered HTML, kept out of their routes' loader data.
 *
 * A route's loader data is sent again for hydration, in a script after the
 * HTML it rendered, so a page's HTML was in the document twice. Loaders
 * return a page without its HTML (with the key of its module, `htmlKey`),
 * and the component reads the HTML from here. The server lists the pages it
 * rendered (`dehydratePages`), and the browser loads their modules before it
 * hydrates (`hydratePages`): each page's own content-hashed chunk, cached
 * like the rest of the site's code.
 */

type PageModule = () => Promise<{
  readonly default: { readonly html: string };
}>;

/** Each page's module, by its key: the path `import.meta.glob` lists it by. */
const modules = new Map<string, PageModule>();
/** The HTML of each page loaded so far, by its key. */
const loaded = new Map<string, string>();

/** A page as its loader returns it: without its HTML, which {@link pageHtml} reads. */
export type WithoutHtml<T extends { readonly html: string }> = Omit<
  T,
  'html'
> & {
  /** The page's module, for {@link pageHtml}. */
  readonly htmlKey: string;
};

/** Lists pages' modules (`import.meta.glob`), so the browser can load them to hydrate. */
export function registerPages(pages: Readonly<Record<string, PageModule>>) {
  for (const [key, load] of Object.entries(pages)) {
    modules.set(key, load);
  }
}

/** Loads a page's module, keeping its HTML here and returning the rest. */
export async function loadPage<T extends { readonly html: string }>(
  key: string,
  load: () => Promise<{ readonly default: T }>,
): Promise<WithoutHtml<T>> {
  const page = await load();
  const { html, ...rest } = page.default;
  loaded.set(key, html);
  return { ...rest, htmlKey: key };
}

/** A loaded page's HTML. Its loader, or {@link hydratePages}, loaded it. */
export function pageHtml(page: { readonly htmlKey: string }): string {
  const html = loaded.get(page.htmlKey);
  if (html === undefined) {
    throw new Error(`${page.htmlKey} renders before its module has loaded`);
  }
  return html;
}

function htmlKeyOf(value: unknown) {
  return typeof value === 'object' &&
    value !== null &&
    'htmlKey' in value &&
    typeof value.htmlKey === 'string'
    ? [value.htmlKey]
    : [];
}

export interface DehydratedPages {
  /** The pages the server rendered, by their keys. */
  readonly pages: ReadonlyArray<string>;
}

/** For the router's `dehydrate`: the pages its matches' loaders returned (`{ doc }`, `{ post }`). */
export function dehydratePages(router: {
  readonly state: {
    readonly matches: ReadonlyArray<{ readonly loaderData?: unknown }>;
  };
}): DehydratedPages {
  return {
    pages: router.state.matches.flatMap((match) => {
      const data: unknown = match.loaderData;
      return typeof data === 'object' && data !== null
        ? Object.values(data).flatMap(htmlKeyOf)
        : [];
    }),
  };
}

const reloadedKey = (key: string) => `trpc-docs:reloaded-for:${key}`;

/** Whether this tab reloaded for `key` already, forgetting it either way. */
function reloadedFor(key: string) {
  try {
    const reloaded = sessionStorage.getItem(reloadedKey(key)) !== null;
    sessionStorage.removeItem(reloadedKey(key));
    return reloaded;
  } catch {
    // Storage is off (a private window): never reload, so never loop.
    return true;
  }
}

function markReloaded(key: string) {
  try {
    sessionStorage.setItem(reloadedKey(key), '');
    return true;
  } catch {
    return false;
  }
}

/**
 * For the router's `hydrate`: loads the pages the server rendered before
 * React hydrates them.
 *
 * Without its page, the app can't hydrate, so a failed load is tried once
 * more, then the page reloads once: a tab opened before a deploy asks for
 * a chunk the deploy replaced, and the reload brings the new page's. If it
 * fails after the reload too, it rejects, and the page stays as the server
 * rendered it.
 */
export async function hydratePages(
  dehydrated: DehydratedPages,
  reload: () => void,
) {
  await Promise.all(
    dehydrated.pages.map(async (key) => {
      const load = modules.get(key);
      if (!load) {
        throw new Error(`${key} isn't a registered page`);
      }
      try {
        await loadPage(key, load).catch(() => loadPage(key, load));
      } catch (error) {
        if (reloadedFor(key) || !markReloaded(key)) {
          throw error;
        }
        reload();
        // The page is going away; hydrating it would be wasted.
        await new Promise<never>(() => {});
      }
      reloadedFor(key);
    }),
  );
}
