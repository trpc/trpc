/**
 * Checks trpc.io's build, where v12 is hidden (`v12.hidden`), in headless
 * Chrome: v12's UI shows only to a session that has landed on `/v12/...` or
 * a URL with `?version=12`, or gone to `/v12` in the app, and then on every
 * page for the rest of the session. Until then its UI is hidden, no link
 * goes to v12 and the version switcher doesn't offer it; after, the links
 * have their `href`. Every page hydrates without an error (a hydration
 * mismatch, React #418). It serves the last build's `dist/client` as
 * `https://trpc.io` and aborts every other request. A new tab is a new
 * session: a new context, with the last one's `localStorage`. `CHROME_PATH`
 * picks the browser. Run with `pnpm v12-reveal:check` after `pnpm build`
 * with `site.url` at `https://trpc.io`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { type BrowserContext, chromium, type Page } from 'playwright-core';

import { atTrpcIo, v12 } from './src/site.ts';

const root = new URL('dist/client', import.meta.url).pathname;
const origin = 'https://trpc.io';
const v11Page = '/docs/server/routers';
const v12Page = `${v12.basePath}/getting-started`;

if (!v12.hidden) {
  if (!atTrpcIo) {
    throw new Error(
      "v12 is hidden only in trpc.io's build: set `site.url` in src/site.ts to https://trpc.io, then `pnpm build`",
    );
  }
  console.log("v12 isn't hidden at trpc.io: nothing to check");
  process.exit(0);
}
if (
  !readFileSync(join(root, 'robots.txt'), 'utf8').includes(
    `Disallow: ${v12.basePath}`,
  )
) {
  throw new Error("dist/client isn't trpc.io's build: `pnpm build` first");
}

const types: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};
const fileAt = (path: string) =>
  [join(root, path), join(root, path, 'index.html')].find(
    (file) => existsSync(file) && statSync(file).isFile(),
  );

const browser = await chromium.launch(
  process.env['CHROME_PATH']
    ? { executablePath: process.env['CHROME_PATH'] }
    : { channel: 'chrome' },
);

/** A tab, with a `sessionStorage` of its own. */
interface Session {
  readonly context: BrowserContext;
  /** Errors the page logged since the last check. */
  readonly errors: Array<string>;
  /** Whether the page was loaded since the last check, not navigated to in the app. */
  loaded: boolean;
  readonly page: Page;
}

/** A new tab: a new context, with `from`'s `localStorage`, as a browser keeps it. */
const session = async (from?: Session): Promise<Session> => {
  const context = await browser.newContext(
    from ? { storageState: await from.context.storageState() } : {},
  );
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      return route.abort();
    }
    const file = fileAt(decodeURIComponent(url.pathname));
    return route.fulfill({
      body: readFileSync(file ?? join(root, '404.html')),
      contentType:
        types[extname(file ?? '404.html')] ?? 'application/octet-stream',
      status: file === undefined ? 404 : 200,
    });
  });
  await context.addInitScript(() => {
    const shifts = { total: 0 };
    Object.assign(self, { layoutShift: shifts });
    new PerformanceObserver((list) => {
      // Shifts before then are Chrome painting a long page as it parses it
      // (the home page is ~1MB, so a slow runner paints it part-parsed), not
      // the reveal, which happens in <head> before the body or on hydration.
      const [navigation] = performance.getEntriesByType('navigation') as Array<
        PerformanceEntry & { domInteractive: number }
      >;
      const parsed = navigation?.domInteractive ?? 0;
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { hadRecentInput: boolean; value: number }
      >) {
        if (!entry.hadRecentInput && parsed > 0 && entry.startTime >= parsed) {
          shifts.total += entry.value;
        }
      }
    }).observe({ buffered: true, type: 'layout-shift' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors: Array<string> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // The requests it aborts, off trpc.io.
    const elsewhere = !message.location().url.startsWith(origin);
    if (message.type() === 'error' && !elsewhere) errors.push(message.text());
  });
  return { context, errors, loaded: false, page };
};

/** Once React has hydrated the page's links and run its effects. */
const settled = async (page: Page) => {
  await page.waitForFunction(() => {
    const own = (element: Element, prefix: string) =>
      Object.entries(element).find(([key]) => key.startsWith(prefix))?.[1];
    // Links in markup React sets as a whole, such as a page's content, have none.
    const set = [...document.querySelectorAll('*')].filter((element) => {
      const props = own(element, '__reactProps$');
      return (
        typeof props === 'object' &&
        props !== null &&
        Object.hasOwn(props, 'dangerouslySetInnerHTML')
      );
    });
    return [...document.querySelectorAll('body, a')].every(
      (element) =>
        own(element, '__reactFiber$') !== undefined ||
        set.some((parent) => parent.contains(element)),
    );
  });
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
};

/** What the page shows of v12. */
const v12State = (page: Page) =>
  page.evaluate(() => {
    const toV12 = (link: HTMLAnchorElement) => {
      const url = new URL(link.href);
      return (
        url.pathname === '/v12' ||
        url.pathname.startsWith('/v12/') ||
        url.searchParams.get('version') === 'v12'
      );
    };
    const ui = [
      ...document.querySelectorAll('[data-v12-ui], [data-home-panel="v12"]'),
    ];
    return {
      attribute: document.documentElement.hasAttribute('data-v12'),
      disabledLinks: document.querySelectorAll(
        'a[aria-disabled="true"]:not([href])',
      ).length,
      homeVersion: document.documentElement.getAttribute('data-home-version'),
      layoutShift: (self as unknown as { layoutShift: { total: number } })
        .layoutShift.total,
      links: [...document.querySelectorAll('a[href]')].filter((link) =>
        toV12(link as HTMLAnchorElement),
      ).length,
      remembered: sessionStorage.getItem('trpc-docs:v12') === '1',
      shownUi: ui.filter((element) => element.checkVisibility()).length,
      textSaysV12: /\bv12\b/i.test(document.body.innerText),
      ui: ui.length,
      url: location.pathname + location.search,
    };
  });

/** The versions a docs page's version switcher offers. */
const offered = async (page: Page) => {
  await page.locator('button[aria-label^="Docs version:"]').first().click();
  const items = page.getByRole('menuitem');
  await items.first().waitFor();
  const versions = (await items.allTextContents()).map(
    (text) => /^v\d+/.exec(text)?.[0] ?? text,
  );
  await page.keyboard.press('Escape');
  return versions;
};

const failures: Array<string> = [];
const lines: Array<string> = [];

type V12State = Awaited<ReturnType<typeof v12State>>;

/**
 * Checks the page `tab` is on after `step`: that v12 is `shown` or not, with
 * no error, no layout shift on a load once the page is parsed, and `more`.
 */
const check = async (
  step: string,
  tab: Session,
  shown: boolean,
  more: (state: V12State) => Array<string> = () => [],
) => {
  await settled(tab.page);
  const state = await v12State(tab.page);
  const problems = shown
    ? [
        ...(state.attribute ? [] : ['no data-v12 on <html>']),
        ...(state.remembered ? [] : ["the session doesn't remember v12"]),
        ...(state.links > 0 ? [] : ['no link to v12']),
        ...(state.disabledLinks === 0
          ? []
          : [`${state.disabledLinks} links without an href`]),
      ]
    : [
        ...(state.attribute ? ['data-v12 on <html>'] : []),
        ...(state.remembered ? ['the session remembers v12'] : []),
        ...(state.links === 0 ? [] : [`${state.links} links to v12`]),
        ...(state.shownUi === 0 ? [] : [`${state.shownUi} v12 UI shown`]),
        ...(state.textSaysV12 ? ['its text says v12'] : []),
      ];
  if (tab.loaded && state.layoutShift > 0) {
    problems.push(`layout shift ${state.layoutShift.toFixed(3)}`);
  }
  problems.push(...more(state), ...tab.errors);
  tab.errors.length = 0;
  tab.loaded = false;
  lines.push(
    `${problems.length === 0 ? 'ok  ' : 'FAIL'} ${step}: ${state.url}, v12 ${state.attribute ? 'shown' : 'hidden'}, ${state.links} links to v12, ${state.shownUi}/${state.ui} v12 UI visible, layout shift ${state.layoutShift.toFixed(3)}`,
  );
  if (problems.length > 0) {
    failures.push(`${step}: ${problems.join('; ')}`);
  }
};

/** Checks the version switcher on the page `tab` is on offers v12, or not. */
const checkOffer = async (step: string, tab: Session, v12Offered: boolean) => {
  const versions = await offered(tab.page);
  const ok = versions.includes('v12') === v12Offered;
  lines.push(
    `${ok ? 'ok  ' : 'FAIL'} ${step}: the switcher offers ${versions.join(', ')}`,
  );
  if (!ok) failures.push(`${step}: the switcher offers ${versions.join(', ')}`);
};

const open = async (tab: Session, path: string) => {
  await tab.page.goto(new URL(path, origin).href, { waitUntil: 'networkidle' });
  tab.loaded = true;
};

/** Navigates in the app with `go`, and fails `step` if that loads a page. */
const navigate = async (
  step: string,
  tab: Session,
  go: () => Promise<unknown>,
  to: (url: URL) => boolean,
) => {
  await tab.page.evaluate(() => {
    document.documentElement.dataset['checked'] = '';
  });
  await go();
  await tab.page.waitForURL(to);
  await settled(tab.page);
  if (
    await tab.page.evaluate(
      () => document.documentElement.dataset['checked'] !== '',
    )
  ) {
    failures.push(`${step}: loaded a page`);
  }
};

const click = (tab: Session, selector: string) => () =>
  tab.page.locator(selector).first().click();

try {
  // A first visit: v12 hidden on the home page and a v11 page.
  const first = await session();
  await open(first, '/');
  await check('home, no flag', first, false, (state) =>
    state.homeVersion === 'v11' ? [] : [`opens on ${state.homeVersion}`],
  );
  await open(first, v11Page);
  await check('v11 page, no flag', first, false);
  await checkOffer('v11 page, no flag', first, false);

  // `?version=12` reveals it, and the session remembers.
  await open(first, '/?version=12');
  await check('home, ?version=12', first, true, (state) => [
    ...(state.url === '/?version=v12' ? [] : [`at ${state.url}`]),
    ...(state.homeVersion === 'v12' ? [] : [`opens on ${state.homeVersion}`]),
    ...(state.shownUi === 2 ? [] : [`${state.shownUi} of the bar and panel`]),
  ]);
  await open(first, v11Page);
  await check('v11 page, same session', first, true, (state) =>
    state.shownUi === state.ui
      ? []
      : [`${state.ui - state.shownUi} v12 UI hidden`],
  );
  await checkOffer('v11 page, same session', first, true);
  await open(first, '/');
  await check('home, same session', first, true, (state) =>
    state.shownUi > 0 ? [] : ['no version bar'],
  );
  await navigate(
    'version bar to v12',
    first,
    click(first, 'a[href="/?version=v12"]:visible'),
    (url) => url.search === '?version=v12',
  );
  await check('version bar to v12', first, true, (state) =>
    state.homeVersion === 'v12' ? [] : [`shows ${state.homeVersion}`],
  );
  await navigate(
    'home link into v12',
    first,
    click(first, 'main a[href^="/v12/docs/"]:visible'),
    (url) => url.pathname.startsWith('/v12/docs/'),
  );
  await check('home link into v12', first, true);

  // A new tab: hidden again, though `localStorage` remembers v12's docs.
  const second = await session(first);
  await open(second, '/');
  await check('home, new session', second, false, (state) =>
    state.homeVersion === 'v11' ? [] : [`opens on ${state.homeVersion}`],
  );
  await open(second, v11Page);
  await check('v11 page, new session', second, false);

  // Going to /v12 in the app, as a link there would, reveals it.
  await navigate(
    'app navigation into v12',
    second,
    () =>
      second.page.evaluate(
        (href) =>
          (
            self as unknown as {
              __TSR_ROUTER__: {
                navigate: (to: { href: string }) => Promise<void>;
              };
            }
          ).__TSR_ROUTER__.navigate({ href }),
        v12Page,
      ),
    (url) => url.pathname === v12Page,
  );
  await check('app navigation into v12', second, true);
  await navigate(
    'header link home',
    second,
    click(second, 'header a[href="/"]:visible, header a[href^="/?"]:visible'),
    (url) => url.pathname === '/',
  );
  await check('header link home', second, true, (state) =>
    state.shownUi > 0 ? [] : ['no version bar'],
  );
  await open(second, v11Page);
  await check('v11 page, after that', second, true);

  // Landing on v12's page reveals it.
  const third = await session();
  await open(third, v12Page);
  await check('v12 page, landed on', third, true);
  await open(third, '/');
  await check('home, after that', third, true);
} finally {
  console.log(lines.join('\n'));
  if (failures.length > 0) {
    console.error(failures.join('\n'));
  }
  await browser.close();
}
console.log(
  `${lines.length} steps through the v12 reveal: ${failures.length} with a problem`,
);
if (failures.length > 0) {
  process.exit(1);
}
